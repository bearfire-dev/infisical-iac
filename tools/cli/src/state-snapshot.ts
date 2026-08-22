// `pnpm state:snapshot <root-spec>|--global|--project <slug>|--all`
// Copy the current Terraform state object for each root into the backups
// bucket under <key-dir>/<timestamp>.tfstate. `prune --retention-days N`
// deletes backups older than N days. State contents are never printed.
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { r2Endpoint } from "./lib/backend.js";
import { die, ok, warn } from "./lib/output.js";
import {
  BACKUP_STATE_BUCKET,
  findRepoRoot,
  formatRootSpec,
  type RootSpec,
  selectRoots,
  sortRoots,
  stateBucket,
  stateClass,
  stateKey,
} from "./lib/repo.js";

const argv = process.argv.slice(2);
const prune = argv[0] === "prune";
const args = prune ? argv.slice(1) : argv;
const repoRoot = findRepoRoot();
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!accountId) die("CLOUDFLARE_ACCOUNT_ID is required");

function creds(prefix: string): { accessKeyId: string; secretAccessKey: string } {
  const id = process.env[`${prefix}_ACCESS_KEY_ID`] ?? process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env[`${prefix}_SECRET_ACCESS_KEY`] ?? process.env.AWS_SECRET_ACCESS_KEY;
  if (!id || !secret)
    die(`missing ${prefix}_ACCESS_KEY_ID/${prefix}_SECRET_ACCESS_KEY (or AWS_* fallback)`);
  return { accessKeyId: id, secretAccessKey: secret };
}

function client(prefix: string): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: r2Endpoint(accountId as string),
    forcePathStyle: true,
    credentials: creds(prefix),
  });
}

export function backupKey(root: RootSpec, now: Date = new Date()): string {
  const dir = stateKey(root).replace(/\/terraform\.tfstate$/, "");
  return `${dir}/${now.toISOString().replaceAll(":", "-")}.tfstate`;
}

async function snapshot(root: RootSpec): Promise<void> {
  const spec = formatRootSpec(root);
  const sourcePrefix = stateClass(root) === "global" ? "TF_GLOBAL_R2" : "TF_PROJECT_R2";
  const source = client(sourcePrefix);
  const bucket = stateBucket(root);
  const key = stateKey(root);

  let size: number | undefined;
  try {
    size = (await source.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).ContentLength;
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "NotFound" || name === "NoSuchKey") {
      warn(`${spec}: no state object yet (${bucket}/${key}); nothing to snapshot`);
      return;
    }
    throw err;
  }

  // CopyObject requires read on the source and write on the destination. The
  // backup credential class has write access to the backups bucket and read on
  // the state buckets; if it lacks source read, fall back to the source creds.
  const target = backupKey(root);
  const copy = new CopyObjectCommand({
    Bucket: BACKUP_STATE_BUCKET,
    Key: target,
    CopySource: `/${bucket}/${key}`,
  });
  try {
    await client("TF_BACKUP_R2").send(copy);
  } catch {
    await source.send(copy);
  }
  const head = await client("TF_BACKUP_R2").send(
    new HeadObjectCommand({ Bucket: BACKUP_STATE_BUCKET, Key: target }),
  );
  if (head.ContentLength !== size) {
    die(`${spec}: backup size mismatch (${head.ContentLength} != ${size}) for ${target}`);
  }
  ok(`${spec}: snapshot ${BACKUP_STATE_BUCKET}/${target} (${size} bytes)`);
}

async function pruneBackups(root: RootSpec, retentionDays: number): Promise<void> {
  const backup = client("TF_BACKUP_R2");
  const prefix = `${stateKey(root).replace(/\/terraform\.tfstate$/, "")}/`;
  const cutoff = Date.now() - retentionDays * 86_400_000;
  let token: string | undefined;
  let removed = 0;
  do {
    const page = await backup.send(
      new ListObjectsV2Command({
        Bucket: BACKUP_STATE_BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents ?? []) {
      if (obj.Key && obj.LastModified && obj.LastModified.getTime() < cutoff) {
        await backup.send(new DeleteObjectCommand({ Bucket: BACKUP_STATE_BUCKET, Key: obj.Key }));
        removed++;
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  ok(`${formatRootSpec(root)}: pruned ${removed} backup(s) older than ${retentionDays} days`);
}

async function main(): Promise<void> {
  const retIdx = args.indexOf("--retention-days");
  const retention = retIdx >= 0 ? Number(args[retIdx + 1]) : undefined;
  const filtered = retIdx >= 0 ? args.filter((_, i) => i !== retIdx && i !== retIdx + 1) : args;
  const { roots } = selectRoots(filtered, { repoRoot, includeBootstrapInAll: true });
  if (!roots.length)
    die(
      "usage: state:snapshot [prune --retention-days N] <root-spec>|--global|--project <slug>|--all",
    );
  for (const root of sortRoots(roots)) {
    if (prune) {
      if (!retention || Number.isNaN(retention)) die("prune requires --retention-days N");
      await pruneBackups(root, retention);
    } else await snapshot(root);
  }
}

main().catch((err) => die((err as Error).message));

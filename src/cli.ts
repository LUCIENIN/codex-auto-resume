import { readFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { runDaemon, startDaemon, stopDaemon } from "./daemon.js";
import { defaultStateDir } from "./paths.js";
import { createJob, loadJob, loadJobs, saveJob, summarizeJob } from "./store.js";
import { runJobOnce } from "./supervisor.js";
import { validateThreadResume } from "./app-server/supervisor.js";

const program = new Command();
const stateDir = defaultStateDir();

program.name("car").description("Codex Auto Resume, an unofficial local Codex CLI supervisor").version("0.1.0");

program
  .command("run")
  .argument("<task>")
  .description("Run a Codex task and automatically resume it after quota reset")
  .action(async (task: string) => {
    const job = await createJob({ stateDir, cwd: process.cwd(), task });
    console.log(`job ${job.id} created`);
    const result = await runJobOnce(job.id, { stateDir });
    console.log(result ? summarizeJob(result) : `job ${job.id} is already locked`);
  });

program
  .command("adopt")
  .argument("<thread-id>")
  .argument("<task>")
  .option("--cwd <dir>", "Working directory for the adopted thread", process.cwd())
  .description("Adopt an existing Codex thread after validating it can be resumed")
  .action(async (threadId: string, task: string, options: { cwd: string }) => {
    const cwd = path.resolve(options.cwd);
    await validateThreadResume({ cwd, threadId });
    const job = await createJob({ stateDir, cwd, task });
    const adopted = { ...job, status: "waiting_rate_limit" as const, threadId, nextRunAt: Date.now() };
    await saveJob(stateDir, adopted);
    console.log(summarizeJob(adopted));
  });

program
  .command("status")
  .description("Show daemon and job summary")
  .action(async () => {
    const jobs = await loadJobs(stateDir);
    const active = jobs.filter((job) => !["completed", "failed", "canceled"].includes(job.status));
    console.log(`state: ${stateDir}`);
    console.log(`jobs: ${jobs.length}, active: ${active.length}`);
    for (const job of active) {
      console.log(summarizeJob(job));
    }
  });

program
  .command("jobs")
  .description("List all jobs")
  .action(async () => {
    for (const job of await loadJobs(stateDir)) {
      console.log(summarizeJob(job));
    }
  });

program
  .command("logs")
  .argument("[job-id]")
  .description("Print job logs")
  .action(async (jobId?: string) => {
    const jobs = await loadJobs(stateDir);
    const selected = jobId ? await loadJob(stateDir, jobId) : jobs.at(-1);
    if (!selected) {
      throw new Error("job not found");
    }
    console.log(await readFile(selected.logPath, "utf8"));
  });

program
  .command("cancel")
  .argument("<job-id>")
  .description("Cancel a waiting job")
  .action(async (jobId: string) => {
    const job = await loadJob(stateDir, jobId);
    if (!job) {
      throw new Error(`job not found: ${jobId}`);
    }
    await saveJob(stateDir, { ...job, status: "canceled" });
    console.log(`canceled ${jobId}`);
  });

const daemon = program.command("daemon").description("Manage the background daemon");

daemon
  .command("start")
  .description("Start daemon in the background")
  .action(async () => {
    const pid = await startDaemon(stateDir);
    console.log(`daemon pid ${pid}`);
  });

daemon
  .command("stop")
  .description("Stop daemon")
  .action(async () => {
    const stopped = await stopDaemon(stateDir);
    console.log(stopped ? "daemon stopped" : "daemon was not running");
  });

daemon
  .command("foreground")
  .description("Run daemon in the foreground")
  .action(async () => {
    console.log(`daemon foreground state=${stateDir}`);
    await runDaemon({ stateDir });
  });

program
  .command("doctor")
  .description("Show resolved paths")
  .action(() => {
    console.log(`state: ${stateDir}`);
    console.log(`cwd: ${path.resolve(process.cwd())}`);
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

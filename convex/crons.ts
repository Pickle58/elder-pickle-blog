import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "resume stale GitHub deletes",
  { minutes: 15 },
  internal.posts.resumeStaleGithubDeletes,
  {},
);

export default crons;

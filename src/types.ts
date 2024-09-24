/**
 * Represents a job that can be processed.
 */
export type Job<TResult = unknown> = () => TResult;

/**
 * Represents the result of a processed job.
 */
export type JobResult<TJob extends Job = Job> = ReturnType<TJob>;

/**
 * Interface for a batch processor that handles an array of jobs.
 */
export interface BatchProcessor<TJob extends Job = Job> {
  /**
   * Processes a batch of jobs and returns an array of promises that
   * resolve to the results of the jobs.
   */
  process: (batch: Array<TJob>) => Array<Promise<JobResult<TJob>>>;
}

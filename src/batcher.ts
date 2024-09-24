import type { BatchProcessor, Job, JobResult } from './types';

/**
 * Configuration options for the Batcher.
 *
 * Either `batchSize` or `frequencyMs` must be provided, though both can be specified.
 */
export type BatcherOptions = {
  /** Maximum number of jobs to accumulate before processing the batch. */
  batchSize?: number;
  /** Time interval (in milliseconds) after which the batch is processed, even if the size limit is not reached. */
  frequencyMs?: number;
} & ({ batchSize: number } | { frequencyMs: number });

type JobQueueItem<TJob extends Job = Job> = {
  job: TJob;
  resolve: (result: JobResult<TJob>) => void;
  reject: (reason?: unknown) => void;
};

export class Batcher<TJob extends Job = Job> {
  private processor: BatchProcessor<TJob>;
  private batchSize: number | undefined;
  private frequencyMs: number | undefined;

  private jobQueue: Array<JobQueueItem<TJob>> = [];
  private pendingBatches: Set<
    Promise<Array<PromiseSettledResult<JobResult<TJob>>>>
  > = new Set();

  private shutdownFlag: boolean = false;
  private timer: NodeJS.Timeout | null = null;

  /**
   * Creates an instance of the Batcher.
   * @param processor - The batch processor to handle the job processing.
   * @param options - Configuration options for the Batcher.
   */
  constructor(processor: BatchProcessor<TJob>, options: BatcherOptions) {
    this.processor = processor;
    this.batchSize = options.batchSize;
    this.frequencyMs = options.frequencyMs;

    this.startTimer();
  }

  /**
   * Starts the timer for processing batches based on the frequency.
   * @private
   */
  private startTimer() {
    if (this.frequencyMs !== undefined) {
      this.timer = setInterval(() => this.processBatch(), this.frequencyMs);
    }
  }

  /**
   * Submits a job to the batcher for processing.
   * @param job - The job to submit.
   * @returns A promise that resolves with the result of the job or rejects with an error.
   */
  submit(job: TJob): Promise<JobResult<TJob>> {
    if (this.shutdownFlag) {
      return Promise.reject(
        new Error('Batcher has been shut down, cannot accept new jobs'),
      );
    }

    // Create a promise for the job
    const jobPromise = new Promise<JobResult<TJob>>((resolve, reject) => {
      this.jobQueue.push({
        job,
        resolve,
        reject,
      });
    });

    // Check if the batch size is reached
    if (
      this.batchSize !== undefined &&
      this.jobQueue.length >= this.batchSize
    ) {
      this.processBatch();
    }

    return jobPromise;
  }

  /**
   * Processes a batch of jobs.
   * @private
   * @returns A Promise that resolves when all jobs in the batch have completed.
   */
  private async processBatch(): Promise<void> {
    if (this.jobQueue.length === 0) return;

    const batch =
      this.batchSize !== undefined
        ? this.jobQueue.splice(0, this.batchSize)
        : this.jobQueue.splice(0);

    const jobs = batch.map(({ job }) => job);

    // Pass the jobs to the processor to be processed
    const promises = this.processor.process(jobs);

    const batchPromise = Promise.allSettled(promises);

    // Track the pending batch
    this.pendingBatches.add(batchPromise);

    // Wait for all promises to settle
    const results = await batchPromise;

    // Stop tracking the batch
    this.pendingBatches.delete(batchPromise);

    results.forEach((result, index) => {
      const jobQueueItem = batch[index];

      if (jobQueueItem) {
        if (result.status === 'fulfilled') {
          jobQueueItem.resolve(result.value);
        } else {
          jobQueueItem.reject(result.reason);
        }
      }
    });
  }

  /**
   * Processes all remaining batches in the job queue.
   * @private
   * @returns A that resolves when all jobs have been processed.
   */
  private async processAllBatches(): Promise<void> {
    const batchPromises: Array<Promise<void>> = [];

    while (this.jobQueue.length > 0) {
      batchPromises.push(this.processBatch());
    }

    await Promise.allSettled(batchPromises);
  }
  /**
   * Shuts down the batcher, processing any remaining jobs before closing.
   * @returns A promise that resolves once all jobs have been processed and shutdown is complete.
   */
  async shutdown(): Promise<void> {
    this.shutdownFlag = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Process any jobs left in the queue
    this.processAllBatches();

    await Promise.allSettled(Array.from(this.pendingBatches));
  }
}

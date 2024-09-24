import { jest, test, beforeEach, expect, describe } from '@jest/globals';
import { Batcher, type BatchProcessor, type Job } from '../src';

describe('Batcher', () => {
  let mockProcessor: BatchProcessor;

  const job1: Job = () => 1;
  const job2: Job = () => 2;
  const job3: Job = () => 3;
  const job4: Job = () => 4;

  const createBatcher = (batchSize = 10, frequencyMs = 1000) =>
    new Batcher(mockProcessor, { batchSize, frequencyMs });

  beforeEach(() => {
    jest.useFakeTimers();

    mockProcessor = {
      process: jest.fn<BatchProcessor['process']>((batch) =>
        batch.map((job) => Promise.resolve().then(job)),
      ),
    };
  });

  test('should process batch immediately when batch size is reached', () => {
    const batcher = createBatcher(2); // Batch size 2

    batcher.submit(job1);
    batcher.submit(job2);

    // Ensure process was called once with the correct jobs
    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect(mockProcessor.process).toHaveBeenCalledWith([job1, job2]);
  });

  test('should process batch at configured frequency if batch size is not reached', () => {
    const batcher = createBatcher();

    batcher.submit(job1);
    batcher.submit(job2);

    // Fast forward timers
    jest.advanceTimersByTime(1000);

    // Ensure process was called once with the correct jobs
    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect(mockProcessor.process).toHaveBeenCalledWith([job1, job2]);
  });

  test('should process jobs in correct batches without reprocessing any job', () => {
    const batcher = createBatcher(2); // Batch size 2

    // Submit 4 jobs rapidly
    batcher.submit(job1);
    batcher.submit(job2);
    batcher.submit(job3);
    batcher.submit(job4);

    // Check the processor is called with the correct batches
    expect(mockProcessor.process).toHaveBeenCalledTimes(2);
    expect(mockProcessor.process).toHaveBeenNthCalledWith(1, [job1, job2]);
    expect(mockProcessor.process).toHaveBeenNthCalledWith(2, [job3, job4]);
  });

  test('should handle multiple concurrent batches', async () => {
    const batcher = createBatcher(2); // Batch size 2

    // Submit 4 jobs (two batches)
    const promise1 = batcher.submit(job1);
    const promise2 = batcher.submit(job2);
    const promise3 = batcher.submit(job3);
    const promise4 = batcher.submit(job4);

    // Await shutdown which processes all pending batches
    await batcher.shutdown();

    expect(mockProcessor.process).toHaveBeenCalledTimes(2);
    expect(mockProcessor.process).toHaveBeenNthCalledWith(1, [job1, job2]);
    expect(mockProcessor.process).toHaveBeenNthCalledWith(2, [job3, job4]);

    // Ensure all promises are resolved
    await expect(promise1).resolves.toBe(1);
    await expect(promise2).resolves.toBe(2);
    await expect(promise3).resolves.toBe(3);
    await expect(promise4).resolves.toBe(4);
  });

  test('should process all remaining jobs immediately on shutdown', async () => {
    const batcher = createBatcher();

    // Submit jobs (but not enough to trigger batch)
    batcher.submit(job1);
    batcher.submit(job2);

    // Call shutdown and ensure jobs are processed immediately
    await batcher.shutdown();

    // Check that process was called once with the remaining jobs
    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect(mockProcessor.process).toHaveBeenCalledWith([job1, job2]);
  });

  test('should handle errors in job processing without affecting others', async () => {
    const batcher = createBatcher(2);

    const failingJob: Job = () => {
      throw new Error('Job failed');
    };

    const promise1 = batcher.submit(job1);
    const promise2 = batcher.submit(failingJob);

    await expect(promise1).resolves.toBe(1);
    await expect(promise2).rejects.toThrow('Job failed');

    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect(mockProcessor.process).toHaveBeenCalledWith([job1, failingJob]);
  });

  test('should resolve shutdown only after all jobs are processed', async () => {
    const batcher = createBatcher(2);

    batcher.submit(job1);
    batcher.submit(job2);

    // Call shutdown and await completion
    await batcher.shutdown();

    // Ensure jobs were processed
    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect(mockProcessor.process).toHaveBeenCalledWith([job1, job2]);
  });

  test('should not accept new jobs after shutdown', async () => {
    const batcher = createBatcher();

    // Call shutdown before submitting a new job
    batcher.shutdown();

    // Try submitting a job after shutdown
    await expect(batcher.submit(job1)).rejects.toThrow(
      'Batcher has been shut down, cannot accept new jobs',
    );

    // Ensure process was never called since no jobs should be processed
    expect(mockProcessor.process).toHaveBeenCalledTimes(0);
  });

  test('should handle multiple shutdown calls gracefully', async () => {
    const batcher = createBatcher(2);

    batcher.submit(job1);
    batcher.submit(job2);

    // First shutdown call
    await batcher.shutdown();

    // Ensure first shutdown processes jobs
    expect(mockProcessor.process).toHaveBeenCalledTimes(1);

    // Call shutdown again (should not break or process any jobs)
    await expect(batcher.shutdown()).resolves.not.toThrow();

    // Ensure no additional processing occurs
    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
  });

  test('should shutdown when with queued jobs', async () => {
    const batcher = createBatcher();

    await batcher.shutdown();

    expect(mockProcessor.process).not.toHaveBeenCalled();
  });
});

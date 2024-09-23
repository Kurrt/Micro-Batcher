import { jest, test, beforeEach, expect, describe } from '@jest/globals';
import { Batcher } from '../src/batcher';

// TODO: Replace with imports when available
type JobResult = unknown;
type Job = () => JobResult;
type BatchProcessor = {
  process: (batch: Array<Job>) => Promise<Array<JobResult>>;
};

describe('Batcher', () => {
  let mockProcessor: BatchProcessor;

  const job1: Job = () => 1;
  const job2: Job = () => 2;

  const createBatcher = (size = 10, frequency = 1000) =>
    new Batcher(mockProcessor, { size, frequency });

  beforeEach(() => {
    mockProcessor = {
      process: jest.fn<BatchProcessor['process']>().mockResolvedValue([]),
    };
  });

  test('should process batch immediately when batch size is reached', async () => {
    // Create batcher with a batch size of 2
    const batcher = createBatcher(2);

    batcher.submit(job1);
    batcher.submit(job2);

    // Ensure process was called once with the correct jobs
    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect(mockProcessor.process).toHaveBeenCalledWith([job1, job2]);
  });

  test('should process batch at configured frequency if batch size is not reached', async () => {
    jest.useFakeTimers();

    const batcher = createBatcher();

    batcher.submit(job1);
    batcher.submit(job2);

    // Fast forward all timers
    jest.runAllTimers();

    // Ensure process was called once with the correct jobs
    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect(mockProcessor.process).toHaveBeenCalledWith([job1, job2]);
  });

  test('should process remaining jobs immediately on shutdown', async () => {
    const batcher = createBatcher();

    // Submit jobs (but not enough to trigger batch)
    batcher.submit(job1);
    batcher.submit(job2);

    // Call shutdown and ensure jobs are processed immediately
    batcher.shutdown();

    // Check that process was called once with the remaining jobs
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
});

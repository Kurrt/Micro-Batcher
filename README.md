# 🚀 Micro Batcher

A library for efficient job batching.

## 📖 Overview

Micro Batcher is a TypeScript library designed to handle job processing in batches. Grouping jobs into batches, can improve throughput by reducing the number of requests made to a downstream system.

## ✨ Features

- Queue jobs ready to be batched when configuration requirements are met.
- Specify batch size and/or processing frequency.
- Supports promise-based job processing, a promise is immediately returned from the batcher, which will be resolved or rejected when the job is executed.

## ⚙️ Requirements

### 🛠️ BYO `BatchProcessor`

Micro Batcher does not handle any of the processing work. This keeps things flexible as you can define exactly how your jobs should run. A `BatchProcessor` interface is provided, which your processor must implement. Your process method **must** maintain the order of the job array it is provided, as order is used to map results back to pending promises.

#### `BatchProcessor` Interface

```typescript
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
```

## ⚙️ Options

When creating an instance of the Batcher, you can provide configuration options to customise its behavior. The options are defined in the `BatcherOptions` type:

### 📝 `BatcherOptions`

- `batchSize?`: **number**  
  The maximum number of jobs to accumulate before processing the batch. If specified, the batch will be processed once this size is reached.

- `frequencyMs?`: **number**  
  The time interval (in milliseconds) after which the batch is processed, even if the size limit is not reached. This allows for time-based processing of jobs.

- **Either `batchSize` or `frequencyMs` must be provided**, but both can be specified for more control over the batching process.

#### Example

```typescript
const batcher = new Batcher(processor, { size: 10, frequency: 2000 });
```

## 🧪 Methods

### 📨 `submit(job: TJob): Promise<JobResult<TJob>>`

The `submit` method allows you to add a job to the batcher for processing. When you call this method, it returns a promise that resolves with the result of the job or rejects with an error if the job fails.

#### Parameters

- `job`: A function representing the job to be processed. It should match the `Job` type.

#### Returns

- A promise that resolves with the job's result or rejects with an error.

#### Example

```typescript
const result = await batcher.submit(() => 'My cool result');
console.log(result); // Outputs: 'My cool result'
```

### 🛑 `shutdown(): Promise<void>`

The `shutdown` method gracefully stops the batcher from accepting new jobs and processes any remaining jobs in the queue. It returns a promise that resolves once all jobs have been processed, ensuring that no job is left unfinished. After shutdown has been called, any further jobs submitted will immediately reject.

#### Returns

- A promise that resolves when all jobs have been processed and the shutdown is complete.

#### Example

```typescript
await batcher.shutdown();
console.log('Batcher has been shut down.');
```

## 💡 Usage Example

This is a minimal example where the processor just executes the job function. The output is defined as an object with keys `id` and `message` and the processor is passed into Batcher on creation, along with settings specifying a max of 5 jobs per batch, and a frequency of 1 second.
Shutdown is then called which immediately triggers the jobs to be processed, and any further jobs submitted will reject with an error.

```typescript
import { Batcher, type BatchProcessor, type Job } from 'micro-batcher';

type JobOutput = {
  id: number;
  message: string;
};

type CustomJob = Job<JobOutput>;

class MyCoolBatchProcessor implements BatchProcessor<CustomJob> {
  process(batch: Array<CustomJob>): Array<Promise<JobOutput>> {
    return batch.map(async (job) => await job());
  }
}

const processor = new MyCoolBatchProcessor();

const batcher = new Batcher(processor, { batchSize: 5, frequencyMs: 1000 });

// Submit jobs to the batcher
batcher
  .submit(() => ({ id: 1, message: 'Hello' }))
  .then(({ message }) => console.log(message));

batcher
  .submit(() => ({ id: 2, message: 'World' }))
  .then(({ message }) => console.log(message));

batcher.shutdown();
```

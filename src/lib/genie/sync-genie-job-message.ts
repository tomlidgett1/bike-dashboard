import type { GenieJob } from "@/lib/genie/genie-job-types";

export function isGenieJobRunning(job: GenieJob) {
  return job.status === "queued" || job.status === "running";
}

export function mergeGenieJobIntoAssistantMessage<T extends object>(message: T, job: GenieJob): T {
  if (isGenieJobRunning(job)) {
    const progressText = job.message ?? "Thinking";
    const progressPhase = job.progressPhase ?? "thinking";
    const partial = job.result?.assistantMessage;
    const base = {
      ...message,
      ...(partial ?? {}),
      isStreaming: true,
      status: progressText,
      statusPhase: progressPhase,
      currentStatus: { phase: progressPhase, text: progressText },
      backgroundJobId: job.id,
      error: undefined,
    };

    return base as T;
  }

  if (job.status === "completed" && job.result?.assistantMessage) {
    const payload = job.result.assistantMessage;
    return {
      ...message,
      ...payload,
      isStreaming: false,
      status: undefined,
      statusPhase: undefined,
      currentStatus: undefined,
      backgroundJobId: job.id,
      error: undefined,
    } as T;
  }

  if (job.status === "failed") {
    return {
      ...message,
      isStreaming: false,
      status: undefined,
      statusPhase: undefined,
      currentStatus: undefined,
      backgroundJobId: job.id,
      error: job.errorMessage ?? "Something went wrong. Please try again.",
    } as T;
  }

  return message;
}

type LocalRepositoryTask<T> = () => Promise<T>;

let localRepositoryWriteChain = Promise.resolve();

export function enqueueLocalRepositoryWrite<T>(task: LocalRepositoryTask<T>, timeoutMs = 45_000) {
  const runWithTimeout = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("本地仓库写入操作超时。")), timeoutMs);
    });
    try {
      return await Promise.race([task(), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const operation = localRepositoryWriteChain.then(runWithTimeout);
  localRepositoryWriteChain = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}


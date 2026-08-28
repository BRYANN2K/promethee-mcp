export interface CloseableService {
    close(): Promise<void>;
}

export interface InstalledLifecycle {
    dispose(): void;
}

export function installProcessLifecycle(service: CloseableService, onError?: (error: Error) => void): InstalledLifecycle {
    let shuttingDown = false;

    const shutdown = () => {
        if (shuttingDown) return;
        shuttingDown = true;
        void service.close().catch(error => {
            try {
                onError?.(error instanceof Error ? error : new Error('Unknown shutdown error'));
            } catch {
                // Reporting must not make shutdown re-entrant.
            }
            process.exitCode = 1;
        });
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    return {
        dispose(): void {
            process.off('SIGINT', shutdown);
            process.off('SIGTERM', shutdown);
        }
    };
}

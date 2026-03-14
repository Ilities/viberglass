/**
 * A specialized mock client that mimics the behavior of a Viberator Worker.
 * It polls for jobs, "executes" them, and posts results back to the platform.
 */
export class MockWorkerClient {
    private pollingInterval: NodeJS.Timeout | null = null;
    private isActive = false;
    private backendUrl: string;
    private processedJobs: string[] = [];

    // Configuration for the "work" it does
    public executionDelayMs = 500;

    constructor(backendUrl: string = 'http://localhost:8888') {
        this.backendUrl = backendUrl;
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;
        console.log('[MockWorker] Started polling for jobs...');

        // Poll every 1s
        this.pollingInterval = setInterval(() => this.poll(), 1000);
    }

    stop() {
        this.isActive = false;
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        console.log('[MockWorker] Stopped.');
    }

    getProcessedJobs() {
        return this.processedJobs;
    }

    private async poll() {
        try {
            // 1. Ask for next job
            // Note: In real implementation, workers might use a specific endpoint or queue.
            // Assuming a standard GET /api/jobs/next or similar for this mock, 
            // BUT for simplicity in this E2E, we might need to "claim" a job we know exists 
            // or list pending jobs.
            // Let's assume we list pending jobs and pick one.

            const response = await fetch(`${this.backendUrl}/api/jobs?status=queued`);
            if (!response.ok) return;

            const data = await response.json();
            const jobs = data.data || data; // Handle pagination or list

            if (Array.isArray(jobs) && jobs.length > 0) {
                const job = jobs[0];
                if (!this.processedJobs.includes(job.id)) {
                    await this.processJob(job);
                }
            }
        } catch (err) {
            console.error('[MockWorker] Polling error:', err);
        }
    }

    private async processJob(job: any) {
        console.log(`[MockWorker] Processing job ${job.id}...`);
        this.processedJobs.push(job.id);

        try {
            // 2. Mark as active (Start)
            // Depending on API, might be implicit or explicit.
            // Providing a heartbeat to keep it alive if needed.

            // 3. Simulate "Work"
            await new Promise(resolve => setTimeout(resolve, this.executionDelayMs));

            // 4. Submit Result
            // The result payload depends on the expected schema.
            const resultPayload = {
                status: 'completed',
                output: {
                    prUrl: 'http://localhost:9999/mock/pull/123', // Pointing to our mock integration
                    branchName: `fix/${job.id}`,
                    diffStats: { additions: 10, deletions: 2 }
                },
                logs: ['Cloned repo', 'Analyzed code', 'Fixed bug', 'Pushed branch', 'Created PR']
            };

            const res = await fetch(`${this.backendUrl}/api/jobs/${job.id}/result`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(resultPayload)
            });

            if (res.ok) {
                console.log(`[MockWorker] Job ${job.id} completed successfully.`);
            } else {
                console.error(`[MockWorker] Failed to submit result for ${job.id}: ${res.statusText}`);
            }
        } catch (err) {
            console.error(`[MockWorker] Error processing job ${job.id}:`, err);
        }
    }
}

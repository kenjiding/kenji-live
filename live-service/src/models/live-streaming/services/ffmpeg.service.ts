import { Injectable } from '@nestjs/common';
  import { exec } from 'child_process';
  import { promisify } from 'util';
  const execAsync = promisify(exec);

  @Injectable()
  export class FFmpegService {
    private ffmpegProcesses: Map<
      string,
      { process: any; rtpPort: number; rtcpPort: number }
    > = new Map();

    async startHlsTranscoding(
      roomId: string,
      rtpPort: number,
      rtcpPort: number,
    ): Promise<string> {

      if (this.ffmpegProcesses.has(roomId)) {
        console.log(`Terminating existing FFmpeg process for room ${roomId}`);
        this.stopHlsTranscoding(roomId);
      }
      const outputDir = `./hls_output/${roomId}`;
      const hlsUrl = `http://127.0.0.1:8080/hls/${roomId}/stream.m3u8`;
      const ffmpegCmd = `
        ffmpeg -protocol_whitelist file,udp,rtp -i rtp://127.0.0.1:${rtpPort}?rtcpport=${rtcpPort} \
        -c:v libx264 -preset ultrafast -b:v 3000k -c:a aac -b:a 128k \
        -f hls -hls_time 4 -hls_list_size 6 -hls_segment_filename ${outputDir}/%03d.ts \
        ${outputDir}/stream.m3u8
      `;
      await execAsync(`mkdir -p ${outputDir}`);
      const ffmpegProcess = exec(ffmpegCmd, (err, stdout, stderr) => {
        if (err) {
          console.error(`FFmpeg error for room ${roomId}:`, err);
          console.error(`FFmpeg stderr:`, stderr);
        }
        console.log(`FFmpeg stdout:`, stdout);
        this.ffmpegProcesses.delete(roomId);
      });
      this.ffmpegProcesses.set(roomId, { process: ffmpegProcess, rtpPort, rtcpPort });
      console.log(
        `FFmpeg started for room ${roomId}, RTP: ${rtpPort}, RTCP: ${rtcpPort}, HLS URL: ${hlsUrl}`,
      );
      return hlsUrl;
    }

    async stopHlsTranscoding(roomId: string): Promise<void> {
      const entry = this.ffmpegProcesses.get(roomId);
      if (entry) {
        const { process, rtpPort, rtcpPort } = entry;
        try {
          process.kill('SIGKILL');
          await new Promise((resolve) => setTimeout(resolve, 1000));
          this.ffmpegProcesses.delete(roomId);
          console.log(
            `FFmpeg stopped for room ${roomId}, released ports RTP: ${rtpPort}, RTCP: ${rtcpPort}`,
          );
          const { exec } = require('child_process');
          exec(`lsof -i :${rtpPort}`, (err, stdout) => {
            if (!err && stdout) {
              console.warn(`Port ${rtpPort} still in use after FFmpeg stop`);
            }
          });
          exec(`lsof -i :${rtcpPort}`, (err, stdout) => {
            if (!err && stdout) {
              console.warn(`Port ${rtcpPort} still in use after FFmpeg stop`);
            }
          });
        } catch (error) {
          console.error(`Failed to stop FFmpeg for room ${roomId}: ${error.message}`);
        }
      }
    }

    isTranscoding(roomId: string): boolean {
      return this.ffmpegProcesses.has(roomId);
    }
  }
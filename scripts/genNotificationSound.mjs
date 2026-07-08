/**
 * Generates a short two-tone "ding-dong" notification WAV into
 * assets/notification.wav. Run once: node scripts/genNotificationSound.mjs
 */
import fs from 'fs';

const sampleRate = 44100;
const samples = [];

function tone(freq, durSec, amp = 0.6) {
  const n = Math.floor(sampleRate * durSec);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 9); // gentle decay
    samples.push(Math.sin(2 * Math.PI * freq * t) * env * amp);
  }
}
function silence(durSec) {
  const n = Math.floor(sampleRate * durSec);
  for (let i = 0; i < n; i++) samples.push(0);
}

// Bright, attention-grabbing "di-ding"
tone(987.77, 0.13); // B5
silence(0.02);
tone(1318.51, 0.22); // E6

const buffer = Buffer.alloc(44 + samples.length * 2);
buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + samples.length * 2, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(1, 22); // mono
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(samples.length * 2, 40);

let off = 44;
for (const s of samples) {
  const v = Math.max(-1, Math.min(1, s));
  buffer.writeInt16LE(Math.round(v * 32767), off);
  off += 2;
}

fs.writeFileSync('assets/notification.wav', buffer);
console.log(`Wrote assets/notification.wav (${(buffer.length / 1024).toFixed(1)} KB)`);

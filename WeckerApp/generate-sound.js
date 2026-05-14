/**
 * Generiert einen Alarm-Sound als WAV-Datei.
 * Einmal ausführen mit: node generate-sound.js
 * Erstellt: assets/sounds/goal.wav
 */

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050; // Hz
const BITS = 8;
const CHANNELS = 1;

// Beep-Muster: 3 kurze Töne hintereinander (klassischer Alarm)
// Jedes Segment: [frequenz, dauer in Sekunden, lautstärke 0-1]
const PATTERN = [
  [880, 0.15, 0.9],  // Beep 1 (hoch)
  [0,   0.07, 0],    // Pause
  [880, 0.15, 0.9],  // Beep 2
  [0,   0.07, 0],    // Pause
  [1100, 0.25, 1.0], // Beep 3 (höher und länger)
  [0,   0.3,  0],    // Pause am Ende
];

// Samples für das gesamte Muster berechnen
const allSamples = [];

for (const [freq, duration, volume] of PATTERN) {
  const numSamples = Math.round(SAMPLE_RATE * duration);
  for (let i = 0; i < numSamples; i++) {
    let value = 128; // Stille = 128 (Mittelpunkt bei 8-bit unsigned)
    if (freq > 0) {
      const t = i / SAMPLE_RATE;
      // Sinus-Ton mit kurzem Ein-/Ausblenden (verhindert Knacksen)
      const fadeLen = Math.round(SAMPLE_RATE * 0.01);
      const fadeIn  = Math.min(i / fadeLen, 1);
      const fadeOut = Math.min((numSamples - i) / fadeLen, 1);
      const envelope = fadeIn * fadeOut;
      value = Math.round(128 + 110 * volume * Math.sin(2 * Math.PI * freq * t) * envelope);
      value = Math.max(0, Math.min(255, value));
    }
    allSamples.push(value);
  }
}

const dataSize   = allSamples.length;
const headerSize = 44;
const fileSize   = headerSize + dataSize;
const buf        = Buffer.alloc(fileSize);

// WAV-Header schreiben
buf.write('RIFF', 0);
buf.writeUInt32LE(fileSize - 8, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);          // PCM-Chunk-Größe
buf.writeUInt16LE(1, 20);           // Format: PCM
buf.writeUInt16LE(CHANNELS, 22);
buf.writeUInt32LE(SAMPLE_RATE, 24);
buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS / 8), 28);
buf.writeUInt16LE(CHANNELS * (BITS / 8), 32);
buf.writeUInt16LE(BITS, 34);
buf.write('data', 36);
buf.writeUInt32LE(dataSize, 40);

// Audio-Daten schreiben
for (let i = 0; i < allSamples.length; i++) {
  buf[44 + i] = allSamples[i];
}

// Datei speichern
const outDir = path.join(__dirname, 'assets', 'sounds');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const outPath = path.join(outDir, 'goal.wav');
fs.writeFileSync(outPath, buf);

console.log('✓ Sound erfolgreich erstellt!');
console.log('  Datei:', outPath);
console.log('  Dauer:', (allSamples.length / SAMPLE_RATE).toFixed(2), 'Sekunden');
console.log('\nJetzt: npx expo start --clear');

const FANFARE_NOTES = [523.25, 659.25, 783.99, 1046.5];
const HARMONICS = [
  { ratio: 1, volume: 0.2 },
  { ratio: 2, volume: 0.075 },
  { ratio: 3, volume: 0.035 },
  { ratio: 4, volume: 0.015 },
];

function soundEffectsEnabled(): boolean {
  try {
    return localStorage.getItem('subcleaner_sound_effects') !== 'false';
  } catch {
    return true;
  }
}

export function playNotificationSound(isSoundEffectsEnabled = true): void {
  if (!isSoundEffectsEnabled || !soundEffectsEnabled()) return;

  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return;
  }

  const play = () => {
    if (context.state === 'closed') return;

    const now = context.currentTime;
    const notes = [659.25, 880];
    notes.forEach((frequency, index) => {
      const start = now + index * 0.14;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index === 0 ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(index === 0 ? 0.1 : 0.12, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.21);
    });

    window.setTimeout(() => void context.close(), 450);
  };

  if (context.state === 'suspended') {
    void context.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
}

export function playSuccessFanfare(): void {
  if (!soundEffectsEnabled()) return;

  let context: AudioContext;

  try {
    context = new AudioContext();
  } catch {
    return;
  }

  const play = () => {
    if (context.state === 'closed') return;

    const now = context.currentTime;
    const masterGain = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, now);
    masterGain.gain.setValueAtTime(0.7, now);
    filter.connect(masterGain);
    masterGain.connect(context.destination);

    FANFARE_NOTES.forEach((frequency, noteIndex) => {
      const start = now + noteIndex * 0.16;
      const duration = noteIndex === FANFARE_NOTES.length - 1 ? 0.62 : 0.2;

      HARMONICS.forEach(({ ratio, volume }) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(frequency * ratio, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(volume, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(filter);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
      });
    });

    window.setTimeout(() => {
      void context.close();
    }, 1800);
  };

  if (context.state === 'suspended') {
    void context.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
}

export function playSubtlePop(): void {
  if (!soundEffectsEnabled()) return;

  let context: AudioContext;

  try {
    context = new AudioContext();
  } catch {
    return;
  }

  const play = () => {
    if (context.state === 'closed') return;

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(520, now);
    oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.07);
    oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.2);

    window.setTimeout(() => {
      void context.close();
    }, 350);
  };

  if (context.state === 'suspended') {
    void context.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
}

export function playCashRegister(): void {
  if (!soundEffectsEnabled()) return;

  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return;
  }

  const play = () => {
    if (context.state === 'closed') return;

    const now = context.currentTime;
    const notes = [1046.5, 1318.5, 1568];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.055;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.09, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.14);
    });

    window.setTimeout(() => void context.close(), 400);
  };

  if (context.state === 'suspended') {
    void context.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
}

export function playAchievementChime(): void {
  if (!soundEffectsEnabled()) return;

  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return;
  }

  const play = () => {
    if (context.state === 'closed') return;

    const now = context.currentTime;
    const notes = [659.25, 880, 1174.66];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.09;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.1, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.22);
    });

    window.setTimeout(() => void context.close(), 500);
  };

  if (context.state === 'suspended') {
    void context.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
}

export function playTaDing(): void {
  if (!soundEffectsEnabled()) return;

  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return;
  }

  const play = () => {
    if (context.state === 'closed') return;
    const now = context.currentTime;
    [783.99, 1174.66].forEach((frequency, index) => {
      const start = now + index * 0.12;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.34);
    });
    window.setTimeout(() => void context.close(), 600);
  };

  if (context.state === 'suspended') {
    void context.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
}
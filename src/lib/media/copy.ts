export type Lang = "km" | "en";

export type Copy = {
  wordmark: string;
  tagline: string;
  quiet: string;
  steps: [string, string, string];
  numerals: [string, string, string];
  s1kicker: string;
  s1title: string;
  s1body: string;
  link: string;
  placeholder: string;
  next: string;
  sample: string;
  sampleNote: string;
  known: string;
  s2kicker: string;
  s2title: string;
  s2body: string;
  recommended: string;
  audio: string;
  audioDetail: string;
  qualities: Record<"max" | "1080" | "720" | "480", string>;
  qualityDetail: Record<"max" | "1080" | "720" | "480", string>;
  find: string;
  back: string;
  reading: string;
  pulling: string;
  extracting: string;
  s3kicker: string;
  s3title: string;
  watchFirst: string;
  saveVideo: string;
  saveAudio: string;
  saveImage: string;
  saveAll: (count: number) => string;
  saving: string;
  recent: string;
  fresh: string;
  change: string;
  emptyPaste: string;
  badLink: string;
  busy: string;
  emptyVideo: string;
  privatePost: string;
  saved: string;
  saveRetry: string;
  opened: string;
  savedMany: (count: number) => string;
  files: string;
  hintExpires: string;
  hintPhoto: string;
  hintAudio: string;
  hintQuality: (asked: string, got: string) => string;
  detailSound: string;
  detailOriginal: string;
  detailAudio: string;
};

export const COPY: Record<Lang, Copy> = {
  km: {
    wordmark: "Canister",
    tagline: "តំណសាធារណៈចូល។ ឯកសារច្បាស់ចេញ។",
    quiet: "មិនបាច់គណនី",
    steps: ["តំណ", "ជ្រើស", "ទាញយក"],
    numerals: ["១", "២", "៣"],
    s1kicker: "ជំហានទី ១",
    s1title: "បិទភ្ជាប់តំណ",
    s1body: "ដាក់តំណវីដេអូ រូបភាព ឬសំឡេងដែលមើលបានដោយមិនចាំបាច់ចូល។",
    link: "តំណ",
    placeholder: "បិទភ្ជាប់តំណសាធារណៈនៅទីនេះ",
    next: "បន្ត",
    sample: "សាកវីដេអូគំរូ",
    sampleNote: "វីដេអូគំរូជាសាធារណៈ។ ប្រកាសឯកជនមិនត្រូវបានយកទេ។",
    known: "ស្គាល់តំណនេះ",
    s2kicker: "ជំហានទី ២",
    s2title: "ជ្រើសអ្វីដែលត្រូវទាញ",
    s2body: "១០៨០ មានទាំងរូបនិងសំឡេង ហើយទាញបានលឿន។",
    recommended: "ណែនាំ",
    audio: "សំឡេង",
    audioDetail: "ឯកសារ MP3",
    qualities: { max: "អតិបរមា", "1080": "1080p", "720": "720p", "480": "480p" },
    qualityDetail: {
      max: "រូបធំបំផុត",
      "1080": "ច្បាស់ មានសំឡេង",
      "720": "ស្មើ និងលឿន",
      "480": "ឯកសារតូច",
    },
    find: "រកឯកសារ",
    back: "ត្រឡប់",
    reading: "កំពុងអានតំណ",
    pulling: "កំពុងរៀបឯកសារ",
    extracting: "កំពុងដកសំឡេង",
    s3kicker: "ជំហានទី ៣",
    s3title: "ទាញយកឯកសារ",
    watchFirst: "មើលសិន",
    saveVideo: "ទាញយកវីដេអូ",
    saveAudio: "ទាញយកសំឡេង",
    saveImage: "ទាញយករូប",
    saveAll: (count) => `ទាញយកទាំង ${count}`,
    saving: "កំពុងទាញយក",
    recent: "ថ្មីៗ",
    fresh: "តំណថ្មី",
    change: "ប្ដូរតំណ",
    emptyPaste: "សូមដាក់តំណសិន។",
    badLink: "សូមប្រើតំណសាធារណៈ។ អាសយដ្ឋានឯកជនមិនត្រូវបានយកទេ។",
    busy: "វីដេអូនេះសាធារណៈ ប៉ុន្តែជំហានទាញកំពុងរវល់។ សូមសាកម្ដងទៀត។",
    emptyVideo: "YouTube មិនបានផ្ញើឯកសារវីដេអូនេះទេ។ មើលបានខាងលើ។ សូមចុច រកឯកសារ ម្ដងទៀត។",
    privatePost: "ប្រកាសឯកជន ឬត្រូវចូលគណនី មិនត្រូវបានយកទេ។",
    saved: "បានចាប់ផ្ដើមទាញយក។",
    saveRetry: "បើមិនចាប់ផ្ដើម សូមចុចទាញយកម្ដងទៀត។",
    opened: "បានបើកឯកសារ ដើម្បីឱ្យកម្មវិធីរុករករក្សាទុក។",
    savedMany: (count) => `បានចាប់ផ្ដើមទាញយកឯកសារ ${count}។`,
    files: "ឯកសារ",
    hintExpires: "ទាញឥឡូវ។ តំណនេះស្ថិតបានតែប៉ុន្មាននាទី។",
    hintPhoto: "តំណនេះជារូប។ បើចង់បានវីដេអូ សូមចម្លងតំណវីដេអូផ្ទាល់។",
    hintAudio: "សំឡេងដាច់ដោយឡែកមិនមានទេ ដូច្នេះទាំងនេះជាវីដេអូ។",
    hintQuality: (asked, got) => `${asked} មិនមានទេ។ ឯកសារល្អបំផុតគឺ ${got}។`,
    detailSound: "H.264 · សំឡេងពេញ",
    detailOriginal: "ឯកសារដើម",
    detailAudio: "សំឡេងប៉ុណ្ណោះ",
  },
  en: {
    wordmark: "Canister",
    tagline: "Public links in. Clear files out.",
    quiet: "No account",
    steps: ["Link", "Choose", "Save"],
    numerals: ["1", "2", "3"],
    s1kicker: "Step 1",
    s1title: "Paste the link",
    s1body: "Use a video, photo, or audio post that is already visible without signing in.",
    link: "Link",
    placeholder: "Paste a public link",
    next: "Continue",
    sample: "Try a sample",
    sampleNote: "The sample is a public film. Private posts are skipped.",
    known: "Recognized",
    s2kicker: "Step 2",
    s2title: "Choose what to save",
    s2body: "1080p keeps picture and sound together, and finishes quickly.",
    recommended: "Best start",
    audio: "Audio",
    audioDetail: "MP3 file",
    qualities: { max: "Max", "1080": "1080p", "720": "720p", "480": "480p" },
    qualityDetail: {
      max: "Largest picture",
      "1080": "Sharp, with sound",
      "720": "Smaller and faster",
      "480": "Small file",
    },
    find: "Find the file",
    back: "Back",
    reading: "Reading the link",
    pulling: "Preparing the file",
    extracting: "Extracting audio",
    s3kicker: "Step 3",
    s3title: "Save the file",
    watchFirst: "Watch first",
    saveVideo: "Save video",
    saveAudio: "Save audio",
    saveImage: "Save image",
    saveAll: (count) => `Save all ${count}`,
    saving: "Saving",
    recent: "Recent",
    fresh: "New link",
    change: "Change link",
    emptyPaste: "Paste a link first.",
    badLink: "Use a public link. Private addresses are skipped.",
    busy: "This video is public, but the save step is busy. Try again.",
    emptyVideo: "YouTube did not send this video file. You can still watch it above. Find the file again.",
    privatePost: "Private and login-only posts are skipped.",
    saved: "Download started.",
    saveRetry: "If nothing starts, tap save again.",
    opened: "Opened the file so the browser can store it.",
    savedMany: (count) => `Started a save for ${count} public files.`,
    files: "Files",
    hintExpires: "Save it now. This link only lasts a few minutes.",
    hintPhoto: "This link came back as a photo. For a video, copy the link from the video itself.",
    hintAudio: "Separate audio isn't available, so these are the video files.",
    hintQuality: (asked, got) => `${asked} wasn't available. The best file is ${got}.`,
    detailSound: "H.264 · full sound",
    detailOriginal: "Original file",
    detailAudio: "Sound only",
  },
};

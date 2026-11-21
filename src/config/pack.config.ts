/** Pack-specific defaults (build spec, section 9). A future maintainer changes this one file. */
export const packConfig = {
  packName: 'Pack 137',
  eyebrow: 'CRANFORD CUB SCOUTS',
  monthlyTitle: 'Pack 137 Stories',
  logoUrl:
    'https://styles.trooptrack.com/photos/23117/3312024a98ad8130285e/medium/pack137_logo_800.jpg',
  standingLinks: [
    {
      label: 'Pack 137 info sheet',
      url: 'https://docs.google.com/document/d/1-t58ZlGo9PzBDtMEPrjpGDSRFtORMt44XOcnwANFIiw/preview?usp=sharing',
    },
    { label: 'Pack website', url: 'https://www.cubpack137.com/' },
    { label: 'TroopTrack', url: 'https://pack137.trooptrack.com/' },
    { label: 'Facebook', url: 'https://www.facebook.com/share/g/NXZXCue4PAeuLVCU/' },
  ],
  email: {
    contact: 'cranfordpack137@gmail.com',
    volunteer: 'cranfordpack137+volunteer@gmail.com',
    feedback: 'cranfordpack137+newsletter@gmail.com',
  },
  photoFormUrl: 'https://forms.gle/PvVux1W4764mSD6T7',
  yearAtAGlanceUrl:
    'https://drive.google.com/file/d/1XXB-F04hhsTvwPULWlwCmHsARWtldEnU/view?usp=drive_link',
  /** Month the program year starts (1 = January). Used by the date helper. */
  programYearStartMonth: 9,
  wordsPerMinute: 230,
} as const;

export type PackConfig = typeof packConfig;

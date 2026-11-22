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
  /**
   * Names that keep their capitals when a heading or a button is put in sentence case. Matched in
   * any capitals and written back as listed here. A longer name wins over a shorter one.
   */
  properNouns: [
    'Pack 137',
    'Cub Scouts',
    'Cub Scout',
    'Scouts BSA',
    'Pinewood Derby',
    'Blue and Gold',
    'Arrow of Light',
    'Webelos',
    'Den',
    'Lions',
    'Tigers',
    'Wolves',
    'Bears',
    'Cranford',
    'First Presbyterian Church of Cranford',
    'Springfield Ave',
    'TroopTrack',
    'SignUpGenius',
    'Google Drive',
    'Google Forms',
    'Toys for Tots',
    'Scouting for Food',
    'TAPinto',
  ],
  /**
   * Well-known sites. In a Link list, a link to one of them gets `note` as its source line.
   * With `subdomains`, "www.youtube.com" counts as "youtube.com".
   */
  knownSites: [
    { host: 'drive.google.com', subdomains: false, note: 'On Google Drive' },
    { host: 'docs.google.com', subdomains: false, note: 'On Google Docs' },
    { host: 'forms.gle', subdomains: false, note: 'On Google Forms' },
    { host: 'youtube.com', subdomains: true, note: 'On YouTube' },
    { host: 'youtu.be', subdomains: false, note: 'On YouTube' },
    { host: 'facebook.com', subdomains: true, note: 'On Facebook' },
    { host: 'tapinto.net', subdomains: true, note: 'TAPinto' },
  ],
} as const;

export type PackConfig = typeof packConfig;

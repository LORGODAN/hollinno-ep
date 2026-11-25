/**
 * SITE SETTINGS: edit this file to change what fans see.
 * After editing, restart the server (on Render: it redeploys when you push to GitHub).
 *
 * Cover: public/assets/cover.jpg (to change it, replace that file or point `ep.cover` below at a new one).
 */
module.exports = {
  artist: {
    name: 'Hollinno', // as written by the client; change it here if the spelling is different
    tagline: 'The new EP. Stream it, and keep it.',
    bio: 'Write the artist bio here. Two or three short paragraphs work best: where he is from, what he sounds like, and what this EP is about.\n\nSeparate paragraphs with a blank line.',
  },

  ep: {
    title: 'Dreams & Reality',
    year: '2026',
    cover: '/assets/cover.jpg',
    price: 5000, // one-time price
    currency: 'MWK',
  },

  // Colours taken from the cover art: pure black, charcoal, silver and white.
  // The page is pure black so the cover's black edges melt into it.
  theme: {
    background: '#000000', // page colour
    surface: '#101010',    // cards and panels
    text: '#ededed',       // main text
    accent: '#f2f2f2',     // buttons and highlights
    accentText: '#0a0a0a', // text on top of the accent colour
  },

  payment: {
    instructions:
      'Send the exact amount to any one of the accounts below. Then enter the transaction ID from your confirmation message and upload a screenshot of it.',
    // id must stay unique and lowercase. Change the label, number and account name.
    methods: [
      { id: 'tnm', label: 'TNM Mpamba', number: '0888 000 000', accountName: 'Account Name' },
      { id: 'airtel', label: 'Airtel Money', number: '0999 000 000', accountName: 'Account Name' },
      { id: 'bank', label: 'Bank transfer', number: 'Bank Name, Account 0000000000', accountName: 'Account Name' },
    ],
  },

  // Social links shown as icons. Supported platforms:
  // facebook, instagram, tiktok, youtube, x, whatsapp, spotify, applemusic, soundcloud, audiomack, snapchat, telegram
  // Delete a line to hide it. Add your own using the same format.
  socials: [
    { platform: 'facebook', url: 'https://facebook.com/' },
    { platform: 'instagram', url: 'https://instagram.com/' },
    { platform: 'tiktok', url: 'https://tiktok.com/' },
    { platform: 'youtube', url: 'https://youtube.com/' },
    { platform: 'whatsapp', url: 'https://wa.me/265999000000' },
  ],

  // WhatsApp messages the admin sends from the dashboard.
  // {name} {ep} {site} {reason} {password} are filled in automatically.
  messages: {
    approved:
      'Hi {name}, your payment for "{ep}" is approved. Log in at {site} with your phone number to stream and download the EP. Enjoy!',
    rejected:
      'Hi {name}, we could not confirm your payment for "{ep}". Reason: {reason}. Please log in at {site} and upload your payment proof again.',
    reset:
      'Hi {name}, your new password for "{ep}" is: {password}\nLog in at {site} with this phone number.',
  },

  poweredBy: { text: 'Powered by Lorgodan', url: '' }, // add a url to make it a link
};

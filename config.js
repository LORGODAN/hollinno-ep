/**
 * SITE SETTINGS: edit this file to change what fans see.
 * After editing, restart the server (on Render: it redeploys when you push to GitHub).
 *
 * Cover: public/assets/cover.jpg (to change it, replace that file or point `ep.cover` below at a new one).
 */
module.exports = {
  artist: {
    name: 'Hollinno', // as written by the client; change it here if the spelling is different
    tagline: 'Sweet afro melodies that carry you from dreams to reality.',
    bio:
      'Hollinno, whose real name is Innocent Kamtuwanje, was born and raised in Malawi and is based in Mgona, Lilongwe. ' +
      'His afro sound is sweet and melodic, made to awaken souls, and his mission is to take Malawian Afro to the next level.\n\n' +
      'Dreams & Reality is about the two emotional sides of life: the dreams we imagine and the realities we live. ' +
      'Every song on the EP follows the road from imagination to real life. Hollinno has worked hard to connect his own dreams and realities with yours. ' +
      'This EP is his emotional breakthrough, and his way of giving people a chance to get to know themselves.\n\n' + 
      'Now currently am working with Jack Force and 2 speaker as my executive producers and my team. They putted much effort and they played a big role on the project.'
  },

  ep: {
    title: 'Dreams & Reality',
    year: '2026',
    cover: '/assets/cover.jpg',
    price: 25000, // one-time price
    currency: 'MK',
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
    // id must stay unique and lowercase.
    // number = what fans see. copy = what the Copy button copies (optional). accountName is optional too.
    methods: [
      { id: 'airtel', label: 'Airtel Money', number: '0992 647 076', copy: '0992647076' },
      { id: 'tnm', label: 'TNM Mpamba', number: '0887 874 640', copy: '0887874640' },
      { id: 'bank', label: 'National Bank of Malawi', number: 'Account 1009451745', copy: '1009451745', accountName: 'Chrissy Kamtuwanje' },
    ],
  },

  // Social links shown as icons. Supported platforms:
  // facebook, instagram, tiktok, youtube, x, whatsapp, spotify, applemusic, soundcloud, audiomack, snapchat, telegram
  // Delete a line to hide it. Add your own using the same format.
  socials: [
    { platform: 'facebook', url: 'https://www.facebook.com/share/19rJ8eeDut/' },
    { platform: 'audiomack', url: 'https://audiomack.com/mrmellanin' },
    { platform: 'youtube', url: 'https://youtube.com/@hollinno' },
    { platform: 'x', url: 'https://x.com/hollinno' },
    { platform: 'tiktok', url: 'https://www.tiktok.com/@hollinno_mrmellanin' },
    { platform: 'whatsapp', url: 'https://wa.me/265992647076' },
  ],

  // WhatsApp messages the admin sends from the dashboard.
  // {name} {ep} {site} {reason} {password} are filled in automatically.
  messages: {
    approved:
      'Hi {name}! \u{1F64F} Thank you so much for getting "{ep}" by Hollinno. Your payment is confirmed and the whole EP is now yours.\n\n' +
      'Log in at {site} with this phone number to stream it, download the songs, or get the full ZIP.\n\n' +
      'There is also a thank-you poster waiting for you on the same page. Add your photo, save it and put it on your WhatsApp status so your friends can get the EP too. Your support means everything! \u{1F525}',
    rejected:
      'Hi {name}, thank you for supporting "{ep}" by Hollinno. \u{1F64F} We could not confirm your payment yet. Reason: {reason}.\n\n' +
      'Please log in at {site} and send your payment proof again. If you need help, just reply here and we will sort it out together.',
    reset:
      'Hi {name}, here is your new password for "{ep}": {password}\n\n' +
      'Log in at {site} with this phone number, and keep the password private. Thank you for supporting Hollinno! \u{1F64F}',
  },

  poweredBy: { text: 'Powered by Lorgodan', url: 'https://www.facebook.com/lorgodan.makhaura'}, // add a url to make it a link
};

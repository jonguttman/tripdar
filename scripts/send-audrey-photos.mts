import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);

const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 580px; margin: 0 auto; padding: 32px; color: #1a1a1a;">
  <div style="text-align: center; margin-bottom: 28px;">
    <div style="font-size: 44px; margin-bottom: 8px;">📷</div>
    <h1 style="margin: 0; font-size: 24px; color: #1a1a1a;">Quick heads up about your product photos</h1>
  </div>

  <p style="font-size: 16px; line-height: 1.65;">Hey Audrey — Jon here. After you left I checked the database and noticed the photos you uploaded for your three products (Cubiq Microdose Gummies, Fun Guy Chocolate Bar, Golden Teacher Psilly Stix) didn&rsquo;t actually save. They&rsquo;re not hiding — they&rsquo;re just not there.</p>

  <p style="font-size: 16px; line-height: 1.65;">This is 100% on us — our app was silently swallowing photo upload errors instead of telling you something went wrong. You did everything right, the system just lied to you about it working. That&rsquo;s already fixed (it&rsquo;ll now show you a big red error if anything fails), but we still need to get your photos in.</p>

  <div style="background: linear-gradient(135deg, #f5f3ff, #fdf2f8); border-radius: 12px; padding: 22px; margin: 26px 0;">
    <h3 style="margin: 0 0 14px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #7c3aed;">🛠️ How to re-add them (2 minutes)</h3>
    <ol style="font-size: 15px; line-height: 1.8; padding-left: 20px; margin: 0;">
      <li>Go to <a href="https://www.tripd.ar/admin/myco" style="color: #7c3aed; font-weight: 600;">tripd.ar/admin/myco</a></li>
      <li>You&rsquo;ll see your 3 products now have an orange <strong>&ldquo;📷 Add photo&rdquo;</strong> placeholder where the image should be — click it (or click the Edit button)</li>
      <li>In the edit panel, drag photos into the photo tray, tag them (stock / package_front / package_back / lifestyle), then click Save</li>
      <li>If anything fails this time, you&rsquo;ll see exactly why instead of it pretending to work</li>
    </ol>
  </div>

  <p style="font-size: 16px; line-height: 1.65;">Quick favor: when you upload, if you hit any error, screenshot it and reply to this email so we can chase down the actual cause (could be a file-size thing, a format thing, or our blob storage being grumpy). We&rsquo;ll fix whatever it is fast.</p>

  <p style="font-size: 16px; line-height: 1.65;">Sorry for the runaround — this is the kind of thing that only surfaces with real users doing real work, which is exactly why having you on the team matters. Thank you for the patience. 🙏</p>

  <p style="font-size: 16px; line-height: 1.65; margin-top: 24px;">— Jon</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0 16px 0;">
  <p style="color: #999; font-size: 12px; text-align: center;">Tripdar · <a href="https://www.tripd.ar/admin" style="color: #7c3aed;">tripd.ar/admin</a></p>
</div>
`;

const text = `Hey Audrey — Jon here.

After you left I checked the database and noticed the photos you uploaded for your three products (Cubiq Microdose Gummies, Fun Guy Chocolate Bar, Golden Teacher Psilly Stix) didn't actually save. They're not hiding — they're just not there.

This is 100% on us — our app was silently swallowing photo upload errors instead of telling you something went wrong. You did everything right; the system lied to you about it working. That's already fixed (it'll show a big red error if anything fails now), but we still need to get your photos in.

HOW TO RE-ADD THEM (2 minutes):

1. Go to https://www.tripd.ar/admin/myco
2. You'll see your 3 products now have an orange "📷 Add photo" placeholder where the image should be — click it (or click the Edit button)
3. In the edit panel, drag photos into the photo tray, tag them (stock / package_front / package_back / lifestyle), then click Save
4. If anything fails this time, you'll see exactly why instead of it pretending to work

QUICK FAVOR: if you hit any error this time, screenshot it and reply to this email so we can chase down the actual cause (could be a file-size issue, a format issue, or our blob storage being grumpy). We'll fix whatever it is fast.

Sorry for the runaround — this is the kind of thing that only surfaces with real users doing real work, which is exactly why having you on the team matters. Thank you for the patience.

— Jon`;

const { data, error } = await resend.emails.send({
  from: "Jon at Tripdar <noreply@tripd.ar>",
  to: ["audrey@highpackdistro.com"],
  cc: ["jonguttman@gmail.com"],
  reply_to: "jonguttman@gmail.com",
  subject: "📷 Quick heads up — your product photos need a re-upload (our bad)",
  html,
  text,
});

if (error) { console.error("ERR", JSON.stringify(error)); process.exit(1); }
console.log("OK", JSON.stringify(data));

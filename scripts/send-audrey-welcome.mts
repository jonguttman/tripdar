
import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);

const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #1a1a1a;">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="font-size: 48px; margin-bottom: 8px;">🍄</div>
    <h1 style="margin: 0; font-size: 28px; background: linear-gradient(135deg, #7c3aed, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Welcome to Tripdar, Audrey!</h1>
  </div>

  <p style="font-size: 16px; line-height: 1.6;">We are <strong>so excited</strong> to have The Mushroom Top as our pilot partner on Tripdar. You are quite literally one of the first humans on Earth to use this platform — and your input is going to shape what this becomes for every psilocybin retailer that comes after you.</p>

  <p style="font-size: 16px; line-height: 1.6;">Your admin portal is ready. From here you can manage TMT&rsquo;s product catalog, upload photos, set effect profiles, and watch the recommendation engine learn from your shoppers in real time.</p>

  <div style="background: linear-gradient(135deg, #f5f3ff, #fdf2f8); border-radius: 12px; padding: 24px; margin: 28px 0;">
    <h3 style="margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #7c3aed;">Your Login</h3>
    <p style="margin: 8px 0;"><strong>URL:</strong> <a href="https://www.tripd.ar/admin" style="color: #7c3aed; text-decoration: none;">tripd.ar/admin</a></p>
    <p style="margin: 8px 0;"><strong>Email:</strong> audrey@highpackdistro.com</p>
    <p style="margin: 8px 0;"><strong>Password:</strong> <code style="background: #fff; padding: 4px 8px; border-radius: 4px; font-family: 'SF Mono', Menlo, monospace;">TheMushr00mT0p</code></p>
  </div>

  <h3 style="font-size: 18px; margin-top: 32px;">What to do first</h3>
  <ol style="font-size: 15px; line-height: 1.8; padding-left: 20px;">
    <li>Log in and head to <strong>Myco Store</strong></li>
    <li>Add a few of your bestsellers — photos, doses, and effect profiles</li>
    <li>Let us know what feels clunky. Seriously, anything.</li>
  </ol>

  <p style="font-size: 16px; line-height: 1.6; margin-top: 32px;">Jon and the team are watching this build live, so if you hit a snag or have an idea, just reply to this email and we will jump on it.</p>

  <p style="font-size: 16px; line-height: 1.6;">Let&rsquo;s build something legendary together. 🚀</p>

  <p style="font-size: 16px; line-height: 1.6; margin-top: 24px;">— The Tripdar Team</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0 16px 0;">
  <p style="color: #999; font-size: 12px; text-align: center;">Tripdar &middot; Helping shoppers find their right trip &middot; <a href="https://www.tripd.ar" style="color: #999;">tripd.ar</a></p>
</div>
`;

const text = `Welcome to Tripdar, Audrey!

We are so excited to have The Mushroom Top as our pilot partner. You are one of the first humans on Earth to use this platform, and your input will shape what it becomes for every psilocybin retailer that comes after you.

YOUR LOGIN
URL: https://www.tripd.ar/admin
Email: audrey@highpackdistro.com
Password: TheMushr00mT0p

WHAT TO DO FIRST
1. Log in and head to Myco Store
2. Add a few of your bestsellers — photos, doses, effect profiles
3. Let us know what feels clunky. Seriously, anything.

Jon and the team are watching this build live, so if you hit a snag or have an idea, just reply to this email.

Let us build something legendary together.

— The Tripdar Team`;

const { data, error } = await resend.emails.send({
  from: "Tripdar <noreply@tripd.ar>",
  to: ["audrey@highpackdistro.com"],
  cc: ["jonguttman@gmail.com"],
  reply_to: "jonguttman@gmail.com",
  subject: "🍄 Welcome to Tripdar, Audrey — your admin access is ready",
  html,
  text,
});

if (error) { console.error("ERR", JSON.stringify(error)); process.exit(1); }
console.log("OK", JSON.stringify(data));

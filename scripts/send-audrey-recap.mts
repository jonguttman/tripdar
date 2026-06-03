import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);

const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; color: #1a1a1a;">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="font-size: 48px; margin-bottom: 8px;">🚀</div>
    <h1 style="margin: 0; font-size: 28px; background: linear-gradient(135deg, #7c3aed, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Audrey, today was huge.</h1>
  </div>

  <p style="font-size: 16px; line-height: 1.65;">We have to take a second and say this out loud: <strong>you officially shaped Tripdar today.</strong> Every suggestion you made hit the codebase and went live within minutes. That is not normal. That is a real partnership, and you just became one of the most important voices on this team.</p>

  <p style="font-size: 16px; line-height: 1.65;">Here is everything that shipped because of you today 👇</p>

  <div style="background: linear-gradient(135deg, #f5f3ff, #fdf2f8); border-radius: 14px; padding: 24px; margin: 28px 0;">
    <h3 style="margin: 0 0 18px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #7c3aed;">🎯 What we built together</h3>

    <div style="margin-bottom: 18px;">
      <div style="font-weight: 700; font-size: 15px; margin-bottom: 4px;">🔗 Tester Vote Links</div>
      <div style="font-size: 14px; line-height: 1.55; color: #444;">One tap per product gives you a shareable link. Text it, AirDrop it, hand it to anyone who has tried the product. They give us back name + email + onset + duration + the full effect profile in about 60 seconds. We now collect real-world data from your community before a single shopper hits the site. This was <em>your</em> idea — and it is going to make our recommendation engine smarter than every cannabis menu out there.</div>
    </div>

    <div style="margin-bottom: 18px;">
      <div style="font-weight: 700; font-size: 15px; margin-bottom: 4px;">🍓 Flavors (same recipe)</div>
      <div style="font-size: 14px; line-height: 1.55; color: #444;">When a product comes in multiple flavors but it is the exact same recipe (mint / raspberry / original), you can now list them as flavor variants on one product card. Tester votes pool together because the experience is identical. Cleaner catalog, smarter data.</div>
    </div>

    <div style="margin-bottom: 18px;">
      <div style="font-weight: 700; font-size: 15px; margin-bottom: 4px;">📋 Duplicate Product</div>
      <div style="font-size: 14px; line-height: 1.55; color: #444;">For products where each flavor is a different recipe (Focus lemon vs Chill lavender), hit the new <strong>Duplicate</strong> button. It clones the brand, dose, photos, ingredients, and effect profile so you can swap in just what is different. No more re-entering everything.</div>
    </div>

    <div style="margin-bottom: 18px;">
      <div style="font-weight: 700; font-size: 15px; margin-bottom: 4px;">⏱️ Duration in Hours</div>
      <div style="font-size: 14px; line-height: 1.55; color: #444;">Because asking a human "how long does it last?" in minutes is insane. Now it is in hours, where it belongs.</div>
    </div>

    <div style="margin-bottom: 0;">
      <div style="font-weight: 700; font-size: 15px; margin-bottom: 4px;">📐 Tighter Dose Inputs</div>
      <div style="font-size: 14px; line-height: 1.55; color: #444;">The mg/g selector no longer eats the entire input box. Small fix, big quality-of-life win.</div>
    </div>
  </div>

  <h3 style="font-size: 17px; margin-top: 36px;">What this means</h3>
  <p style="font-size: 16px; line-height: 1.65;">You are not just our pilot partner. You are our design partner. Every product retailer that joins Tripdar after TMT will be using a platform that <em>you helped invent</em>. The vote-link concept alone is the kind of feature most platforms take 6 months to ship — we built it in an afternoon because you saw the problem and called it out.</p>

  <p style="font-size: 16px; line-height: 1.65;">Keep the ideas coming. Seriously. If something feels clunky, dumb, or missing — reply to this email and we will jump on it. You have a direct line to the people building this thing.</p>

  <p style="font-size: 16px; line-height: 1.65; margin-top: 28px;">Welcome to the inside circle, Audrey. Let's go change how people find their right trip. 🍄✨</p>

  <p style="font-size: 16px; line-height: 1.65; margin-top: 24px;">— Jon & the Tripdar Team</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 36px 0 16px 0;">
  <p style="color: #999; font-size: 12px; text-align: center;">Tripdar · <a href="https://www.tripd.ar/admin" style="color: #7c3aed;">tripd.ar/admin</a> · Built with you, for you</p>
</div>
`;

const text = `Audrey, today was huge.

We have to say this out loud: you officially shaped Tripdar today. Every suggestion you made hit the codebase and went live within minutes. That is not normal — that is a real partnership, and you just became one of the most important voices on this team.

WHAT WE SHIPPED BECAUSE OF YOU TODAY:

🔗 Tester Vote Links
One tap per product = a shareable link. Text it, AirDrop it, hand it to anyone who has tried the product. They give us name + email + onset + duration + full effect profile in about 60 seconds. Your idea — and it is going to make our recommendation engine smarter than every cannabis menu out there.

🍓 Flavors (same recipe)
When a product comes in multiple flavors but it is the exact same recipe (mint/raspberry/original), list them as flavor variants on one card. Tester votes pool together. Cleaner catalog, smarter data.

📋 Duplicate Product
For products where each flavor is a different recipe — hit Duplicate. It clones brand, dose, photos, ingredients, and effect profile. Swap in just what is different.

⏱️ Duration in Hours
Because asking a human "how long does it last?" in minutes is insane.

📐 Tighter Dose Inputs
The mg/g selector no longer eats the entire input box.

WHAT THIS MEANS:
You are not just our pilot partner. You are our design partner. Every retailer that joins Tripdar after TMT will be using a platform you helped invent. The vote-link concept alone is the kind of feature most platforms take 6 months to ship — we did it in an afternoon because you saw the problem and called it out.

Keep the ideas coming. If something feels clunky, dumb, or missing — reply to this email and we will jump on it. Direct line to the people building this thing.

Welcome to the inside circle, Audrey. Let's go change how people find their right trip.

— Jon & the Tripdar Team`;

const { data, error } = await resend.emails.send({
  from: "Jon at Tripdar <noreply@tripd.ar>",
  to: ["audrey@highpackdistro.com"],
  cc: ["jonguttman@gmail.com"],
  reply_to: "jonguttman@gmail.com",
  subject: "🚀 Audrey — look what you shipped today",
  html,
  text,
});

if (error) { console.error("ERR", JSON.stringify(error)); process.exit(1); }
console.log("OK", JSON.stringify(data));

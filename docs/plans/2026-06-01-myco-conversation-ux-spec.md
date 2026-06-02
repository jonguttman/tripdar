# Myco Conversation Flow and Recommendation Output UX Spec

**Date:** 2026-06-01
**Status:** Ready for Generator
**Source:** `tripdar-spec/myco-platform-spec-2026-05-21.md`
**Pilot:** The Other Path / TOP tablet kiosk

## Purpose

Myco is a warm, unhurried healer guide for psilocybin product discovery. The experience should feel like being gently understood by a knowledgeable guide, not like completing a quiz or chatting with a generic bot.

The Phase 1b UX covers:

- Age verification gate
- Guided conversation across intent, experience level, and format preference
- Dynamic follow-up logic for sensitive or high-context paths
- Recommendation output screen with product cards, dose guidance, safety language, and profile save CTA

## Product Principles

- Myco speaks with warmth, curiosity, and restraint.
- The flow is conversational, but the user always understands where they are.
- The interface never gamifies, scores, ranks, or pressures a choice.
- Product fit is framed as "may align with what you shared," not as certainty.
- Dose guidance uses community language, never prescriptive language.
- Every screen includes: "Everyone is different. Start low and go slow."
- Every screen includes medical disclaimer language: "This is not medical advice. Consult a healthcare provider."
- Age verification blocks all access before the conversation begins.

## Global Layout

### Tablet Kiosk Frame

- Target: in-store tablet, arm's-length readability.
- Minimum touch target: 56px height.
- Primary action buttons: full-width on narrow tablet, 280px minimum on wider tablet.
- Body text: 18px minimum.
- Screen title: 32-44px depending on viewport.
- Avoid dense forms. Use one major decision per screen.
- Keep the safety sentence above the fold on every screen.

### Persistent Safety Rail

Every post-age-gate screen includes a visible safety rail near the top:

```text
Everyone is different. Start low and go slow.
```

The rail should be visually calm but impossible to miss. It should not be rendered as fine print.

Every screen footer includes:

```text
This is not medical advice. Consult a healthcare provider.
```

On the recommendation output screen, add the expanded recommendation disclaimer in the body:

```text
These are recommendations based on your goals and community experience. They are not medical advice.
```

### Conversation Shell

Each conversation screen has:

- Store welcome mark or small store name
- Myco name
- Safety rail
- Main prompt from Myco
- Optional one-sentence helper copy
- Large touch choices or short text input
- Back action after the age gate
- Continue action only when needed
- Progress text using calm labels, not step counters: `Finding your direction`, `Understanding your comfort`, `Choosing a format`, `Almost there`

Do not show numeric progress such as `Step 2 of 5`.

## Screen 0: Age Verification Gate

### Requirement

This is the first screen. Nothing else is accessible until confirmed.

### Layout

- Full-screen gate, not a popup or banner.
- Centered content block with generous spacing.
- No navigation, no footer links into the app.
- Optional TOP/store mark may appear, but it must not create a path around the gate.

### Copy

Primary prompt:

```text
Are you 21 or older?
```

Support copy:

```text
Myco is available only to guests 21 and older.
```

Primary action:

```text
Yes, I'm 21+
```

Secondary action:

```text
No
```

### Interaction

- If `Yes, I'm 21+`: store `ageConfirmed: true` on the session and proceed to Welcome.
- If `No`: replace actions with the denial state.
- Do not allow browser route access to any Myco screen without `ageConfirmed: true`.
- Refreshing or starting a new kiosk session should require confirmation again unless the product team explicitly chooses a session persistence window.

### Denial State

```text
Myco is only available to guests 21 and older.
```

No further navigation. Optional button:

```text
End session
```

## Screen 1: Welcome

### Purpose

Set the tone and make clear that Myco is a guide, not a quiz.

### Myco Copy

```text
I'm Myco. I can help you find a starting point that fits what you want to feel today.
```

Helper copy:

```text
We'll move slowly. You can answer only what feels useful.
```

Primary action:

```text
Begin
```

### Components

- Myco intro text
- Safety rail
- Begin button
- Optional store-customized welcome line, limited to one short sentence

## Screen 2: Intent

### Purpose

Capture the first primary axis: what the guest wants to feel.

### Myco Copy

```text
What would you like support with today?
```

Helper copy:

```text
Choose the direction that feels closest. We can refine it next.
```

### Choice Set

Use large chips or cards with labels and one-line descriptions.

| Intent | Label | Description |
|---|---|---|
| focus | Focus | Clearer attention, steady energy |
| creativity | Creativity | Flow, ideas, expression |
| sleep | Sleep | Winding down, deeper rest |
| anxiety_relief | Anxiety relief | More calm, less overwhelm |
| first_time_curiosity | First-time curiosity | Gentle orientation, no rush |
| spiritual | Spiritual | Reflection, meaning, ceremony |
| social | Social | Connection, openness, ease |
| healing | Healing | Processing, release, integration |

### Interaction

- User selects one primary intent.
- Allow a short optional free-text note after selection: `Anything you want Myco to know?`
- Store as `intent.primary` and `intent.note`.

## Screen 3: Intent Follow-Up

### Purpose

Make the flow feel personal by adapting the next question to the selected intent.

### Shared Rules

- Ask one follow-up question, then continue.
- Use choice buttons where possible.
- Add optional short text input only when helpful.
- Avoid clinical claims and diagnostic language.

### Branching Matrix

| Condition | Follow-up prompt | Choices / input |
|---|---|---|
| `intent = first_time_curiosity` | `What would help you feel most comfortable starting out?` | `Knowing what to expect`, `Keeping it very gentle`, `Talking through setting`, `I'm not sure yet` |
| `intent = first_time_curiosity` after comfort answer | `Where do you imagine this experience happening?` | `At home`, `With a trusted person`, `Outdoors`, `Still deciding` |
| `experience = never_tried` later in flow | Add safety framing screen before results | See Screen 6B |
| `intent = sleep` | `When are you hoping this support would fit into your evening?` | `Early evening`, `Before bed`, `Middle of the night waking`, `Still figuring it out` |
| `intent = anxiety_relief` | `When do you most want more calm?` | `During the day`, `Before social plans`, `At night`, `During stressful moments` |
| `intent = healing` | `What kind of support feels most relevant?` | `Gentle emotional space`, `Processing something specific`, `Grounding`, `Integration after prior experiences` |
| `intent = spiritual` | `What kind of container are you imagining?` | `Solo reflection`, `Guided ceremony`, `Nature`, `Meditation or journaling` |
| `intent = social` | `What kind of social setting are you thinking about?` | `Small trusted group`, `Creative gathering`, `Public event`, `I'm not sure` |
| `intent = focus` | `When would you want that focus to show up?` | `Morning`, `Afternoon`, `Creative work`, `Physical activity` |
| `intent = creativity` | `What kind of creative space are you looking for?` | `Ideas`, `Making things`, `Music or art`, `Movement` |

### Copy Tone Examples

Use:

```text
That gives me a direction.
```

```text
Let's keep this gentle.
```

Avoid:

```text
Great choice!
```

```text
This will help your anxiety.
```

```text
Best match score: 94%
```

## Screen 4: Experience Level

### Purpose

Capture the second primary axis and determine the safety depth.

### Myco Copy

```text
How familiar are you with psilocybin products?
```

Helper copy:

```text
This helps Myco choose the pace and language of the guidance.
```

### Choice Set

| Value | Label | UX treatment |
|---|---|---|
| never_tried | Never tried | Adds comfort and safety framing |
| tried_a_few_times | Tried a few times | Gentle guidance, fewer assumptions |
| occasional | Occasional | Standard follow-ups |
| experienced | Experienced | Allows tolerance and timing probes when relevant |

## Screen 5: Experience Follow-Up

### Branching Matrix

| Condition | Follow-up prompt | Choices / input |
|---|---|---|
| `experience = never_tried` | `What would make this feel safer to explore?` | `Very low starting point`, `Clear timing expectations`, `Having someone nearby`, `Understanding the format` |
| `experience = tried_a_few_times` | `What has mattered most in past experiences?` | `Dose felt manageable`, `Setting felt right`, `Timing was predictable`, `I am still learning` |
| `experience = occasional` | `What do you already know you prefer?` | `Subtle effects`, `Noticeable but grounded`, `Longer-lasting`, `Shorter and easier to plan` |
| `experience = experienced` | `Is there anything from past products you want to account for?` | Short text input plus quick choices: `Tolerance`, `Timing`, `Strength`, `Format` |
| `intent = sleep AND experience = experienced` | `For sleep, what has worked or not worked before?` | `Onset was too slow`, `Too strong late at night`, `Didn't last`, `Worked well at low dose`, optional text |

### Special Handling

If `experience = never_tried`, Myco should slow the rhythm:

- Use slightly longer helper copy.
- Show the comfort screen before recommendations.
- Default recommendation filtering should favor MICRO mode and gentler products where catalog data supports it.

## Screen 6: Format Preference

### Purpose

Capture the third primary axis.

### Myco Copy

```text
What format feels most comfortable?
```

Helper copy:

```text
If you are not sure, Myco can keep options open.
```

### Choice Set

| Value | Label | Description |
|---|---|---|
| capsule | Capsule | Simple, measured, easy to plan |
| edible | Edible | Familiar, slower onset for many people |
| dried | Dried | Traditional, flexible, may require measuring |
| tincture | Tincture | Adjustable, often easier to start small |
| no_preference | Not sure | Let Myco keep options open |

Issue scope listed capsule, edible, dried, and tincture. The source spec also allows `other`; for Phase 1b, use `Not sure` instead of `Other` to keep the kiosk path clear.

## Screen 6B: Comfort and Safety Framing

### Trigger

Show before recommendation generation when:

- `intent = first_time_curiosity`
- `experience = never_tried`
- User selected a safety-related answer in an earlier follow-up

### Myco Copy

```text
For a first exploration, the setting matters as much as the product.
```

Body copy:

```text
Choose a calm place, leave yourself time, and consider having a trusted person nearby. Start with the low end of any guidance and give the experience time before taking more.
```

Primary action:

```text
Show gentle options
```

### Components

- Safety rail
- Three short set-and-setting reminders:
  - `Calm place`
  - `Enough time`
  - `Trusted support`
- Continue button

## Screen 7: Reflection Before Results

### Purpose

End the conversation with a short reflection before showing products.

### Copy Template

```text
Based on what you've shared, it sounds like you are looking for [intent reflection], with [experience framing], and a format that feels [format framing].
```

Examples:

```text
Based on what you've shared, it sounds like you are looking for a gentle first starting point, with clear expectations and a format that feels measured.
```

```text
Based on what you've shared, it sounds like you are looking for sleep support that fits late evening timing, with enough familiarity to account for tolerance.
```

Primary action:

```text
See options
```

Secondary action:

```text
Adjust answers
```

## Screen 8: Recommendation Output

### Purpose

Show products that may align with the user's stated goals and community experience, while keeping dose guidance cautious and non-prescriptive.

### Header Copy

```text
Here are a few starting points that may fit what you shared.
```

Expanded disclaimer:

```text
These are recommendations based on your goals and community experience. They are not medical advice.
```

Safety rail remains above the result list:

```text
Everyone is different. Start low and go slow.
```

### Result List Rules

- Show 2-4 products.
- Do not show numeric ranks, scores, badges, or "best" language.
- Ordering may be by fit internally, but the UI should not display ranking.
- If confidence is low, show fewer products and an explanatory empty/low-confidence state.
- If no products match the selected format, show adjacent options with transparent copy: `I did not find a strong match in tincture today, so I kept the closest formats visible.`

### Product Card Components

Each product card includes:

- Product photo
- Product name
- Brand name when available
- Format
- Key vibes, max 3
- One-sentence "why this appears" explanation
- Dose guidance block
- Strength offset disclaimer when configured
- `Save to profile` or `Email this to me` action

### Product Card Layout

```text
[Photo]
Product name
Format | Brand

Key vibes:
[Focus] [Calm] [Gentle]

Why this appears:
Community experience around this product often aligns with [intent/vibe language].

Dose guidance:
A typical starting dose for your weight range is X-Ymg.
[Offset disclaimer if applicable]

Everyone is different. Start low and go slow.
```

### Key Vibe Mapping

Use the existing Myco intent to PsillyOps vibe mapping:

| Intent | Vibe dimension |
|---|---|
| Spiritual / journey | transcend |
| Focus / energy / active | energize |
| Creativity / flow | create |
| Healing / anxiety / processing | transform |
| Social / connection | connect |
| Sleep | transform + transcend, low dose |
| First-time curiosity | balanced, MICRO mode preferred |

Display vibes in guest-friendly language:

| Dimension | Display label examples |
|---|---|
| transcend | Reflective, expansive, meaning-oriented |
| energize | Clear, active, focused |
| create | Creative, fluid, expressive |
| transform | Grounding, processing, restorative |
| connect | Open, social, heart-forward |

## Dose Guidance UX

### Required Inputs

The recommendation screen needs enough information to render a weight-based range. If weight is not captured in this conversation, Generator must include one of these patterns:

- Ask for weight range before results.
- Or show a non-personalized range with clear copy: `To personalize the starting range, Myco needs a weight range.`

Preferred Phase 1b pattern: ask for a broad weight range in a lightweight modal before recommendations if the session lacks profile weight data.

### Weight Range Modal

Prompt:

```text
For dose guidance, what weight range should Myco use?
```

Choices:

- `Under 120 lb`
- `120-160 lb`
- `160-200 lb`
- `200+ lb`
- `Skip for now`

Helper:

```text
This is used only to show a broad community starting range.
```

If skipped, show dose block as:

```text
Community guidance is weight-based. Ask the store team for help finding the lowest starting range for this product.
```

### Dose Copy Rules

Use:

```text
A typical starting dose for your weight range is X-Ymg.
```

Use when stronger:

```text
Community feedback suggests this product hits stronger than standard guidance. Consider starting at the lower end.
```

Use when lighter:

```text
Community feedback suggests this product hits lighter than standard guidance. Effects can still vary. Start low and give it time.
```

Avoid:

```text
We recommend taking Xmg.
```

```text
Take more if you do not feel it.
```

```text
This will help you sleep.
```

## Save Profile CTA

### Placement

- Sticky bottom area on recommendation screen after the first product card is visible.
- Also available on each product card as `Save this option`.

### Copy

```text
Save your profile for next time
```

Helper:

```text
Myco can remember what you were looking for and what you tried.
```

Input:

```text
Email address
```

Action:

```text
Send magic link
```

### States

- Empty email
- Invalid email
- Submitting
- Magic link sent
- Already recognized returning user

Returning user greeting on future sessions:

```text
Welcome back. Last time you were looking for [intent]. What brings you in today?
```

## Conversation State Contract

Generator should shape the client state around this object:

```ts
type MycoConversationState = {
  ageConfirmed: boolean;
  storeId: string;
  sessionId: string;
  intent?: {
    primary:
      | "focus"
      | "creativity"
      | "sleep"
      | "anxiety_relief"
      | "first_time_curiosity"
      | "spiritual"
      | "social"
      | "healing";
    note?: string;
    followUps: Record<string, string | string[]>;
  };
  experience?: "never_tried" | "tried_a_few_times" | "occasional" | "experienced";
  experienceFollowUps: Record<string, string | string[]>;
  formatPreference?: "capsule" | "edible" | "dried" | "tincture" | "no_preference";
  weightRange?: "under_120" | "120_160" | "160_200" | "200_plus" | "skipped";
  safetyFramingShown: boolean;
};
```

## Recommendation Data Contract

Product cards need this minimum shape:

```ts
type MycoRecommendationProduct = {
  id: string;
  name: string;
  brandName?: string;
  format: "capsule" | "edible" | "dried" | "tincture" | "other";
  photoUrl?: string;
  keyVibes: string[];
  whyShown: string;
  doseGuidance: {
    rangeLabel?: string;
    rangeMgMin?: number;
    rangeMgMax?: number;
    weightRange?: string;
    skippedWeight: boolean;
  };
  strengthOffset?: {
    value: "standard" | "stronger" | "lighter";
    rationale?: string;
  };
};
```

## Error and Empty States

### No Catalog Available

```text
Myco cannot see today's product list yet.
```

Action:

```text
Ask the store team
```

### No Good Fit

```text
I do not want to force a match. Based on what you shared, there is not a clear product fit in today's catalog.
```

Actions:

- `Adjust answers`
- `Ask the store team`

### Recommendation API Error

```text
Myco could not load options right now.
```

Actions:

- `Try again`
- `Ask the store team`

## Accessibility and Kiosk Behavior

- All controls keyboard accessible for non-kiosk use.
- Visible focus states.
- Color is not the only signal for selected choices.
- No auto-advancing after a choice unless the transition is clearly perceivable.
- Kiosk idle timeout should clear personal session state and return to age gate.
- Avoid long scrolling before results. On tablet, each conversation decision should fit in one viewport.
- Recommendation output may scroll, but safety rail remains visible at the top of the results screen.

## Generator Acceptance Checklist

- Age gate is first and blocks all routes until confirmed.
- `No` age response prevents any further navigation.
- Every screen displays `Everyone is different. Start low and go slow.` above the fold.
- Every screen includes medical disclaimer language.
- Intent, experience, and format are captured in that order.
- First-time curiosity path slows down and includes comfort plus set-and-setting questions.
- Never-tried path includes comfort and safety framing.
- Sleep plus experienced path asks about timing, tolerance, and previous products.
- Recommendation cards include name, format, photo, key vibes, dose guidance, strength offset disclaimer, and save CTA.
- Dose guidance uses ranges, not single numbers.
- Dose copy avoids prescriptive language such as "we recommend."
- Output screen includes the required recommendations disclaimer.
- UI avoids scores, rankings, gamification, and sales pressure.
- Save profile CTA uses email magic-link framing.
- Empty and API error states do not force a product match.

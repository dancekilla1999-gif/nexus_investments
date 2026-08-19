# Manual Test Checklist: Claude.ai Skill

**Purpose:** Check that the Content Writer Claude AI Skill works with multi-profile support.

**Prerequisites:**
- Claude.ai account (Free, Pro, Team, or Enterprise)
- Skill uploaded to Claude.ai (see `docs/setup-claude-ai.md`)

---

## Test 1: Skill Upload and Activation

**Steps:**
1. Go to claude.ai, then Settings, then Capabilities, then Skills
2. Upload the `skills/adapters/claude-skill/` folder
3. Name it "Content Writer"
4. Save the skill

**Verification:**
- [ ] The skill appears in the Skills list
- [ ] The skill shows the "Content Writer" name
- [ ] The skill status is "Active"

---

## Test 2: Description-Triggered Activation

**Steps:**
1. Start a new conversation
2. Type: "Write me a LinkedIn post about remote work"

**Expected:**
- [ ] Claude recognizes the content request
- [ ] Claude loads the Content Writer skill (it may show "Using Content Writer skill")
- [ ] If no profiles exist, Claude offers to create one
- [ ] If profiles exist, Claude asks which profile to use

---

## Test 3: First Profile Creation

**Steps:**
1. Open a fresh conversation with no profiles
2. Type: "Write a blog post about productivity"
3. When Claude prompts you, agree to create a profile
4. Complete the 10-topic interview:
   - Give brand identity
   - Give industry and market info
   - Describe the target audience
   - Give voice and tone adjectives
   - Share content strategy
   - List 1 to 2 products or services
   - Share 1 case study
   - Give 1 to 2 CTAs
   - Describe the publishing workflow
   - Share SEO keywords
5. Name the profile "Test-Brand"

**Expected:**
- [ ] The interview feels conversational, not a rigid form
- [ ] Claude asks natural follow-up questions
- [ ] At the end, Claude outputs `PROFILE-Test-Brand.md` as an artifact
- [ ] The artifact contains all 10 sections
- [ ] Claude sets the profile as active for this project automatically
- [ ] Claude returns to the original content request

---

## Test 4: Multi-Profile Creation

**Steps:**
1. In the same project, type: `/writer:profile-create Personal-Blog`
2. Complete the interview with different details:
   - Personal brand, not a company
   - Different voice and tone
   - Different audience
3. Type: `/writer:profile-list`

**Expected:**
- [ ] Claude creates the second profile
- [ ] `/writer:profile-list` shows both profiles:
  ```
  • Test-Brand (active for this project)
  • Personal-Blog
  ```

---

## Test 5: Profile Switching

**Steps:**
1. Type: `/writer:profile-use Personal-Blog`
2. Type: `/writer:profile-list`

**Expected:**
- [ ] Claude confirms: "Switched to Personal-Blog profile"
- [ ] The list now shows:
  ```
  • Test-Brand
  • Personal-Blog (active for this project)
  ```

---

## Test 6: Profile Per Project Isolation

**Steps:**
1. Note the active profile in the current Project A (for example, "Personal-Blog")
2. Create a new Claude Project (Project B)
3. Type: `/writer:profile-list`
4. Type: `/writer:profile-use Test-Brand`
5. Return to Project A
6. Type: `/writer:profile-list`

**Expected:**
- [ ] Project B shows the same profiles available at first
- [ ] Project B can set a different active profile
- [ ] Project A still shows "Personal-Blog" active, because Project B did not change it
- [ ] Each project keeps an independent profile assignment

---

## Test 7: Phase 1, Discuss

**Steps:**
1. Set an active profile first
2. Type: `/writer:discuss "AI tools for remote teams"`
3. Answer the conversational questions:
   - Topic angle
   - Platform (LinkedIn)
   - Audience
   - Awareness stage
   - Goal
   - Confirm the framework
   - Length
   - Research inputs (optional)
   - CTA selection

**Expected:**
- [ ] The questions flow naturally, not like a form
- [ ] Claude suggests a suitable framework
- [ ] At the end, Claude outputs a one-paragraph content brief
- [ ] The brief captures all key points
- [ ] Claude asks for confirmation before it continues

---

## Test 8: Phase 2, Plan

**Steps:**
1. Confirm the brief from Test 7
2. Or type: `/writer:plan`

**Expected:**
- [ ] Claude loads `references/content-frameworks.md`
- [ ] Claude loads platform conventions (LinkedIn)
- [ ] Claude builds a detailed outline with:
  - Section headings
  - Key points per section
  - CTA placement
- [ ] Claude defines the SEO strategy:
  - Primary keyword
  - Secondary keywords
  - Meta title
  - Meta description
  - URL slug
- [ ] Claude presents the outline for confirmation

---

## Test 9: Phase 3, Execute

**Steps:**
1. Confirm the plan from Test 8
2. Or type: `/writer:execute`

**Expected:**
- [ ] The draft appears as an artifact
- [ ] The content follows the outline structure
- [ ] The content uses the active profile voice and tone
- [ ] The content includes the profile CTAs
- [ ] Keyword placement is natural, not stuffed
- [ ] First-person CTAs ("Start my trial", not "Start your trial")
- [ ] No AI patterns (check for `leverage`, `seamless`, `robust`, `delve`, `realm`, and similar words)

---

## Test 10: Phase 4, Verify

**Steps:**
1. Confirm the draft from Test 9
2. Or type: `/writer:verify`

**Expected:**
- [ ] Claude loads `references/anti-ai-checklist.md`
- [ ] Claude runs the anti-AI audit (manual fallback if the humanizer is unavailable)
- [ ] Claude checks SEO elements (manual fallback if claude-seo is unavailable)
- [ ] Claude presents the findings:
  - AI patterns found, if any
  - SEO recommendations
  - Quality checklist results
- [ ] Claude offers to apply fixes

**STE compliance gate (v2.4.0):**
- [ ] The STE gate runs during the verify step. The Claude AI skill bundles the linter and runs it when code execution is available. If code execution is unavailable, Claude runs a manual self-lint against `references/ste-writing-rules.md`
- [ ] A draft that contains a banned word (for example `utilize` or `seamless`) is BLOCKED and does not ship
- [ ] The passing draft records `ste_gate: pass` in the verify output. It records `ste_gate: manual` when code execution is unavailable
- [ ] The passing draft records an `ste_per100w` score
- [ ] `/writer:ship` refuses to ship unless the STE gate passed

---

## Test 11: Phase 5, Ship

**Steps:**
1. Confirm the verification from Test 10
2. Or type: `/writer:ship`

**Expected:**
- [ ] The final content appears as an artifact
- [ ] The filename format is `content-writer-output/linkedin/001-[slug].md`
- [ ] The content includes YAML frontmatter:
  - title
  - platform
  - framework
  - word_count
  - created date
  - author
  - status: draft
  - seo meta fields
- [ ] The content is polished and ready to publish
- [ ] The content includes platform-specific publishing notes

---

## Test 12: Auto-Advance (`/writer:next`)

**Steps:**
1. Start a new conversation in the same project
2. Type: `/writer:next`

**Expected:**
- [ ] Claude detects the current phase (it should be `complete` or empty)
- [ ] If the phase is complete, Claude suggests a new project with `/writer:discuss`
- [ ] If the phase is mid-way, Claude continues from the last saved point

---

## Test 13: Status Check

**Steps:**
1. Type: `/writer:status`

**Expected:**
- [ ] Claude shows the active profile name
- [ ] Claude shows the current phase
- [ ] Claude shows a brief summary of the project state
- [ ] Claude suggests the next step

---

## Test 14: Profile View

**Steps:**
1. Type: `/writer:profile-view Test-Brand`

**Expected:**
- [ ] Claude outputs `PROFILE-Test-Brand.md` as an artifact
- [ ] The artifact shows all 10 profile sections
- [ ] The content matches what you entered during creation

---

## Test 15: Profile Edit

**Steps:**
1. Type: `/writer:profile-edit Test-Brand`
2. Select "Products" to edit
3. Add a new product
4. Save

**Expected:**
- [ ] Claude asks which fields to edit
- [ ] Claude updates the product section
- [ ] Claude outputs the updated profile as an artifact
- [ ] The changes persist (check with `/writer:profile-view`)

---

## Test 16: Profile Deletion

**Steps:**
1. Create a test profile: `/writer:profile-create Temp-Profile`
2. Complete a minimal interview
3. Type: `/writer:profile-delete Temp-Profile`
4. Confirm the deletion

5. Type: `/writer:profile-list`

**Expected:**
- [ ] Claude shows a confirmation prompt before it deletes
- [ ] Claude removes the profile from the list
- [ ] If the profile was active, Claude clears the assignment

---

## Test 17: Different Profile, Different Voice

**Steps:**
1. Create two profiles with distinctly different voices:
   - "Corporate-SaaS": formal, professional, B2B focused
   - "Casual-Blogger": informal, personal, B2C focused
2. Write the same topic with each profile:
   - `/writer:profile-use Corporate-SaaS`
   - `/writer:discuss "productivity tips"`, then complete all phases
   - `/writer:profile-use Casual-Blogger`
   - `/writer:discuss "productivity tips"`, then complete all phases

**Expected:**
- [ ] The corporate version uses formal language and business terms
- [ ] The casual version uses a conversational tone and personal anecdotes
- [ ] Both include their own CTAs
- [ ] The voice difference is clear

---

## Test 18: Network Access Fallback

**Steps:**
1. During profile creation, give a URL for tone detection
2. If the URL fetch fails because there is no network, Claude should:
   - Detect the failure
   - Ask you to paste 2 to 3 paragraphs instead

**Expected:**
- [ ] Claude falls back to manual paste without trouble
- [ ] Claude still analyzes the tone from the pasted text
- [ ] No crash or error

---

## Test 19: Help Command

**Steps:**
1. Type: `/writer:help`

**Expected:**
- [ ] Claude lists all available commands
- [ ] Claude shows quick start instructions
- [ ] Claude explains the five phases

---

## Test 20: Memory Persistence

**Steps:**
1. Start a conversation in Project A
2. Create a profile and complete part of the workflow (for example, finish the discuss phase)
3. Close the tab or browser
4. Reopen claude.ai
5. Go back to Project A
6. Type: `/writer:status`

**Expected:**
- [ ] Claude remembers the active profile
- [ ] Claude remembers the current phase
- [ ] You can continue with `/writer:next`

---

## Sign-Off

**Tested by:** _________________  
**Date:** _________________  
**Claude.ai Plan:** _________________ (Free/Pro/Team/Enterprise)

**Overall Result:**
- [ ] PASS: all critical tests passed (Tests 1 to 5, 7 to 11, 17)
- [ ] PARTIAL: some tests failed but the skill is usable
- [ ] FAIL: critical functionality is broken

**Notes:**
_______________________________________
_______________________________________
_______________________________________

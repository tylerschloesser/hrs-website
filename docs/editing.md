# Editing haitianrelief.org

This is the guide for the people who keep the site's words and photos up to
date. You don't need to know anything about code.

## What you need, once

1. **A GitHub account.** Free — sign up at https://github.com/join if you don't
   have one. Use whatever email you like; it does not have to be your HRS
   address.
2. **An invitation.** Send Tyler your GitHub username and he'll add you as a
   collaborator on the site's repository. Accept the emailed invitation before
   your first sign-in, or the CMS will tell you it can't find the repository.

That's the whole setup. There is no separate CMS password.

## Signing in

1. Go to **https://haitianrelief.org/admin/**.
2. Click **Sign In with GitHub**.
3. A GitHub window opens and asks you to authorize _Haitian Relief Services
   CMS_. It asks for access to your **public** repositories only — it cannot
   see anything private of yours.
4. The window closes and you land in the editor.

Your browser remembers you, so you normally do this once per device.

## The shape of the site

The left sidebar has two groups.

**Singletons** — the one-of-a-kind pages and settings:

| Item              | What lives there                                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Site settings** | Organization name, tagline, the description search engines show, the social share image, the donate links and mailing address                                                                 |
| **Home page**     | The intro paragraphs, the big photo at the top, the mission statement, the "Why Our Work Matters" section                                                                                     |
| **Events**        | The benefit concert section: heading, description, photo, YouTube links (the top one in the list also plays on the page), and the social-media preview used by the `/concert.html` share link |
| **Contacts**      | The board list (name, role, email) and the board photo                                                                                                                                        |

**Projects** — one entry per project, in the order they appear on the page.
Each has a title, an **Order** number (lower numbers come first), a photo
gallery, an optional file attachment, and a description.

## Making a text edit

1. Click the page or project in the sidebar.
2. Change the text. Formatting buttons (bold, italic, link, bullet list, a
   heading) are above the box; there is also a **raw** mode if you'd rather
   type Markdown directly.
3. Click **Save**.

## What happens after you save

Saving publishes. The site rebuilds itself and the change is live in about
**2 to 5 minutes** — it is not instant, so don't refresh in a panic. If it's
been much longer than that, tell Tyler.

You don't need to watch for problems yourself. Every morning the site is
loaded and checked automatically, and if anything is broken Tyler gets an
email about it before anyone else notices.

## Adding or replacing a photo

1. Open the project (or the page) you want the photo on.
2. In **Gallery**, click **Add** → the image field → **Upload** and pick the
   file from your computer.
3. Write a **caption**. Captions are shown under the photo in the lightbox and
   are read aloud by screen readers, so write a real sentence, not `IMG_4821`.
4. Save.

**Upload the biggest, original file you have.** The CMS shrinks it to at most
2048 pixels and converts it to a modern format on the way in, and the site then
generates every size it needs. A photo you have already shrunk yourself can
never be made sharp again. Photos that arrived over text message or WhatsApp
are usually already damaged — if you can get the original off the camera or out
of the original email, use that instead.

To **remove** a photo, use the ⋮ menu on that gallery row and delete the row.

To **reorder** photos, drag the rows.

## Alt text and captions

Every image field that has an "alt text" box next to it needs one sentence
describing what is in the picture, for people using a screen reader. Describe
the content, not the file: "Students outside the new school building in
Ganthier", not "school photo".

### Photos and search results

The site also builds a preview card — the picture and text that show up when
someone pastes a link into Facebook, iMessage, or a text — for two places:

- **Site settings → Social share image** is the picture used when the site as
  a whole is shared.
- **Events → Share preview → Image** is the picture used specifically when the
  benefit-concert link (`/concert.html`) is shared.

Both get cropped to a wide rectangle, so pick a wide, landscape photo rather
than a portrait one — a tall photo will lose its top and bottom. Changing
either picture changes what people see the moment they paste that link
somewhere, so treat it like changing the site's cover photo.

## What not to touch

- **Google Tag Manager ID** in Site settings. Changing it silently turns off
  analytics.
- **Redirect to** under Events → Share preview. It's what makes the old
  `/concert.html` link keep working.
- **Order** numbers, unless you actually mean to reorder the projects — and if
  you do, change them so they stay distinct.
- Anything that looks like a file path (`media/...`, `images/...`,
  `/documents/...`). Use the upload button instead of typing paths.

## If something looks wrong

Every save is recorded, and every version of every page is kept forever, so
nothing you do here is unrecoverable. If a save breaks something or a change
doesn't appear, tell Tyler with the page name and roughly when you saved — that
is enough to find and undo it.

## Adding a whole new project

You can: **Projects → New Project**. You'll need a title, an order number, and
at least a description. Deleting projects is deliberately turned off; ask Tyler
if one needs to go.

## Removing a photo for good

Deleting a gallery row takes the photo off the site, but **leaves the image
file in the repository**. That is harmless — nothing links to it and it is not
published — but if you want it gone entirely, switch to the **Assets** tab
(the photo icon in the bottom toolbar), find the file, and delete it there.

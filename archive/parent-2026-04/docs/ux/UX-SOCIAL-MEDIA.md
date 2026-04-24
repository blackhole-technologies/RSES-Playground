# Social Media Integration UX Specification

## Executive Summary

This specification defines a comprehensive social media integration experience for the RSES CMS, enabling multi-platform publishing, analytics, content scheduling, and team collaboration. The design draws inspiration from industry leaders including Hootsuite (multi-platform management), Buffer (scheduling UI), Sprout Social (analytics), Later (visual calendar), and Canva (content adaptation), while maintaining consistency with the established RSES CMS design system.

---

## Table of Contents

1. [Social Media Connections](#1-social-media-connections)
2. [Bulk Content Publishing](#2-bulk-content-publishing)
3. [Social Media Analytics](#3-social-media-analytics)
4. [Content Calendar](#4-content-calendar)
5. [Platform-Specific Adaptations](#5-platform-specific-adaptations)
6. [User Flows](#6-user-flows)
7. [Component Specifications](#7-component-specifications)
8. [Accessibility Considerations](#8-accessibility-considerations)

---

## 1. Social Media Connections

### 1.1 Information Architecture

```
Social Media Hub (/social)
|
+-- Connections (/social/connections)
|   +-- Add Platform
|   +-- Platform Settings
|   +-- Access Management
|
+-- Compose (/social/compose)
|   +-- Multi-Platform Editor
|   +-- Media Library
|   +-- Preview Panel
|
+-- Calendar (/social/calendar)
|   +-- Month View
|   +-- Week View
|   +-- Day View
|   +-- Queue View
|
+-- Analytics (/social/analytics)
|   +-- Dashboard Overview
|   +-- Platform Reports
|   +-- Content Performance
|   +-- Audience Insights
|
+-- Settings (/social/settings)
    +-- Posting Preferences
    +-- Team Permissions
    +-- Approval Workflows
```

### 1.2 Supported Platforms

| Platform | Icon Color | Features | Character Limit |
|----------|------------|----------|-----------------|
| Twitter/X | #000000 | Posts, Threads, Media | 280 |
| Facebook | #1877F2 | Posts, Stories, Reels | 63,206 |
| Instagram | #E4405F | Posts, Stories, Reels, Carousels | 2,200 |
| LinkedIn | #0A66C2 | Posts, Articles, Documents | 3,000 |
| TikTok | #000000 | Videos, Captions | 2,200 |
| YouTube | #FF0000 | Videos, Shorts, Community | 5,000 |
| Pinterest | #BD081C | Pins, Idea Pins | 500 |
| Threads | #000000 | Posts, Media | 500 |
| Mastodon | #6364FF | Toots, Media | 500* |

*Mastodon limit varies by instance

### 1.3 Connection Flow Wireframes

#### Platform Selection Screen

```
+------------------------------------------------------------------+
| Social Media Connections                          [+ Add Platform] |
+------------------------------------------------------------------+
|                                                                    |
| CONNECTED ACCOUNTS (3)                                             |
| +-------------------------------------------------------------+   |
| | [X Logo] Twitter/X                                          |   |
| | @company_handle                         [Connected]  [...]  |   |
| | Last synced: 2 minutes ago                                  |   |
| +-------------------------------------------------------------+   |
| +-------------------------------------------------------------+   |
| | [LinkedIn Logo] LinkedIn                                    |   |
| | Company Page                            [Connected]  [...]  |   |
| | Last synced: 5 minutes ago                                  |   |
| +-------------------------------------------------------------+   |
| +-------------------------------------------------------------+   |
| | [Instagram Logo] Instagram                                  |   |
| | @company_official                       [Connected]  [...]  |   |
| | Last synced: 10 minutes ago                                 |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| AVAILABLE PLATFORMS                                                |
| +-------------+ +-------------+ +-------------+ +-------------+    |
| | [FB Logo]   | | [TikTok]    | | [YouTube]   | | [Pinterest] |    |
| | Facebook    | | TikTok      | | YouTube     | | Pinterest   |    |
| | [Connect]   | | [Connect]   | | [Connect]   | | [Connect]   |    |
| +-------------+ +-------------+ +-------------+ +-------------+    |
| +-------------+ +-------------+                                    |
| | [Threads]   | | [Mastodon]  |                                    |
| | Threads     | | Mastodon    |                                    |
| | [Connect]   | | [Connect]   |                                    |
| +-------------+ +-------------+                                    |
|                                                                    |
+------------------------------------------------------------------+
```

#### OAuth Connection Modal

```
+------------------------------------------------------------------+
| Connect Twitter/X                                             [X] |
+------------------------------------------------------------------+
|                                                                    |
| [Twitter/X Logo - Large]                                           |
|                                                                    |
| Connect your Twitter/X account to:                                 |
|                                                                    |
| [Check] Post content directly from the CMS                         |
| [Check] Schedule posts for optimal times                           |
| [Check] Track engagement and analytics                             |
| [Check] Reply to mentions and comments                             |
|                                                                    |
| PERMISSIONS REQUESTED                                              |
| +-------------------------------------------------------------+   |
| | [Read] Read tweets and profile information                  |   |
| | [Write] Post tweets on your behalf                          |   |
| | [Analytics] Access engagement metrics                       |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| By connecting, you agree to our Terms of Service and              |
| acknowledge you've read our Privacy Policy.                        |
|                                                                    |
|              [Cancel]  [Connect with Twitter/X]                    |
|                                                                    |
+------------------------------------------------------------------+
```

#### Connection Success State

```
+------------------------------------------------------------------+
| [Success Icon]                                                     |
|                                                                    |
| Successfully Connected!                                            |
|                                                                    |
| Your Twitter/X account @company_handle is now linked.              |
|                                                                    |
| QUICK SETUP                                                        |
| +-------------------------------------------------------------+   |
| | Default timezone:     [America/New_York      v]              |   |
| | Auto-schedule posts:  [x] Optimal times  [ ] Custom          |   |
| | Enable analytics:     [x] Track all posted content           |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| WHAT'S NEXT?                                                       |
| +---------------------+ +---------------------+ +--------------+   |
| | [Compose Icon]      | | [Calendar Icon]     | | [Analytics] |   |
| | Create your         | | Plan your           | | View past   |   |
| | first post          | | content calendar    | | performance |   |
| +---------------------+ +---------------------+ +--------------+   |
|                                                                    |
|                           [Done]                                   |
+------------------------------------------------------------------+
```

### 1.4 Multi-Account Management

```
+------------------------------------------------------------------+
| Twitter/X Accounts                                    [+ Add More] |
+------------------------------------------------------------------+
|                                                                    |
| ACCOUNTS (3)                                                       |
|                                                                    |
| +-------------------------------------------------------------+   |
| | [Avatar] @company_handle                                    |   |
| |          Company Main Account                               |   |
| |          Followers: 45.2K  |  Posts: 2,341                  |   |
| |                                                             |   |
| | Team Access: [Admin][Editor][Editor]                        |   |
| | Status: [Active] Primary account                            |   |
| |                                                             |   |
| | [Settings] [Analytics] [Disconnect]                         |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| +-------------------------------------------------------------+   |
| | [Avatar] @company_support                                   |   |
| |          Customer Support Account                           |   |
| |          Followers: 12.8K  |  Posts: 8,921                  |   |
| |                                                             |   |
| | Team Access: [Support][Support]                             |   |
| | Status: [Active]                                            |   |
| |                                                             |   |
| | [Settings] [Analytics] [Disconnect]                         |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| +-------------------------------------------------------------+   |
| | [Avatar] @company_dev                                       |   |
| |          Developer Relations                                |   |
| |          Followers: 8.5K  |  Posts: 1,245                   |   |
| |                                                             |   |
| | Team Access: [DevRel][DevRel]                               |   |
| | Status: [Active]                                            |   |
| |                                                             |   |
| | [Settings] [Analytics] [Disconnect]                         |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### 1.5 Fediverse/Mastodon Configuration

```
+------------------------------------------------------------------+
| Connect Mastodon Instance                                     [X] |
+------------------------------------------------------------------+
|                                                                    |
| [Mastodon Logo]                                                    |
|                                                                    |
| The Fediverse is decentralized. Enter your instance URL:           |
|                                                                    |
| Instance URL: [https://mastodon.social______________]              |
|                                                                    |
| POPULAR INSTANCES                                                  |
| +-------------------------------------------------------------+   |
| | mastodon.social     | General purpose, largest instance     |   |
| | fosstodon.org       | Free & open source software focus     |   |
| | hachyderm.io        | Tech community focused                |   |
| | infosec.exchange    | Information security community        |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| INSTANCE DETAILS (auto-detected)                                   |
| +-------------------------------------------------------------+   |
| | Character limit: 500                                        |   |
| | Media limit: 4 images or 1 video                            |   |
| | Video max length: 60 seconds                                |   |
| | Supported formats: jpg, png, gif, mp4, webm                 |   |
| +-------------------------------------------------------------+   |
|                                                                    |
|              [Cancel]  [Connect to Instance]                       |
+------------------------------------------------------------------+
```

---

## 2. Bulk Content Publishing

### 2.1 Multi-Platform Compose Interface

#### Main Compose Screen

```
+------------------------------------------------------------------+
| Create Post                                [Save Draft] [Schedule] |
+------------------------------------------------------------------+
|                                                                    |
| PUBLISH TO                                                         |
| +-------------------------------------------------------------+   |
| | [x] Twitter/X     [x] LinkedIn    [ ] Instagram              |   |
| | [ ] Facebook      [ ] TikTok      [x] Threads                |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| +---------------------------+----------------------------------+   |
| |                           |                                  |   |
| | COMPOSE                   | PREVIEW                          |   |
| |                           |                                  |   |
| | +-----------------------+ | +------------------------------+ |   |
| | | Write your post...    | | | [Twitter/X Preview]          | |   |
| | |                       | | |                              | |   |
| | | Introducing our new   | | | @company_handle              | |   |
| | | feature! Built with   | | | Introducing our new feature! | |   |
| | | #AI to help you       | | | Built with #AI to help you   | |   |
| | | manage content        | | | manage content smarter.      | |   |
| | | smarter.              | | |                              | |   |
| | |                       | | | [Image Preview]              | |   |
| | | Check it out:         | | |                              | |   |
| | | example.com/feature   | | | 2:30 PM - Feb 1, 2026        | |   |
| | +-----------------------+ | +------------------------------+ |   |
| |                           |                                  |   |
| | [Image] [Video] [GIF]     | Platform: [Twitter v] [< >]      |   |
| | [Link] [Poll] [Location]  |                                  |   |
| |                           | CHARACTER COUNT                  |   |
| | CHARACTER ANALYSIS        | +------------------------------+ |   |
| | +-----------------------+ | | Twitter/X:  142/280   [OK]   | |   |
| | | Twitter/X:  142/280   | | | LinkedIn:   142/3000  [OK]   | |   |
| | | LinkedIn:   142/3000  | | | Threads:    142/500   [OK]   | |   |
| | | Threads:    142/500   | | +------------------------------+ |   |
| | +-----------------------+ |                                  |   |
| |                           |                                  |   |
| +---------------------------+----------------------------------+   |
|                                                                    |
| MEDIA ATTACHMENTS                                                  |
| +-------------------------------------------------------------+   |
| | [+Add Media]  [feature-banner.png - 1200x630] [x]            |   |
| |                                                              |   |
| | Media Compatibility:                                         |   |
| | [OK] Twitter/X: Image meets requirements                     |   |
| | [OK] LinkedIn: Image meets requirements                      |   |
| | [Warning] Instagram: Not selected, add square crop?          |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| AI SUGGESTIONS                                                     |
| +-------------------------------------------------------------+   |
| | [Lightbulb] Add trending hashtags: #TechNews #Productivity   |   |
| | [Lightbulb] Best time to post: 10:00 AM EST (high engagement)|   |
| | [Lightbulb] Add a call-to-action for better engagement       |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### 2.2 Platform-Specific Content Adaptation

#### Adaptation Panel

```
+------------------------------------------------------------------+
| Platform Adaptations                                               |
+------------------------------------------------------------------+
|                                                                    |
| Your content will be adapted for each platform:                    |
|                                                                    |
| TWITTER/X                                        [Edit Separately] |
| +-------------------------------------------------------------+   |
| | Introducing our new feature! Built with #AI to help you     |   |
| | manage content smarter.                                     |   |
| |                                                              |   |
| | Check it out: example.com/feature                           |   |
| |                                                              |   |
| | [Image: feature-banner.png]                                  |   |
| |                                                              |   |
| | 142/280 characters | 1 image | Link auto-shortened          |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| LINKEDIN                                         [Edit Separately] |
| +-------------------------------------------------------------+   |
| | [AI Enhanced] We're excited to announce our newest feature!  |   |
| | Powered by AI, this tool revolutionizes how you manage       |   |
| | content.                                                     |   |
| |                                                              |   |
| | Key benefits:                                                |   |
| | - Smarter content organization                               |   |
| | - AI-powered suggestions                                     |   |
| | - Seamless multi-platform publishing                         |   |
| |                                                              |   |
| | Learn more: example.com/feature                              |   |
| |                                                              |   |
| | #ContentManagement #AI #Productivity                         |   |
| |                                                              |   |
| | 412/3000 characters | 1 image | Professional tone           |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| THREADS                                          [Edit Separately] |
| +-------------------------------------------------------------+   |
| | New feature alert! Our AI-powered content manager is here.  |   |
| |                                                              |   |
| | Link in bio for details.                                    |   |
| |                                                              |   |
| | [Image: feature-banner.png]                                  |   |
| |                                                              |   |
| | 89/500 characters | 1 image | Casual tone                   |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| [Sync All Changes]  [Review Before Posting]                        |
|                                                                    |
+------------------------------------------------------------------+
```

### 2.3 Character Count and Warnings

#### Character Limit Indicator Component

```
+------------------------------------------------------------------+
| CHARACTER LIMITS                                                   |
+------------------------------------------------------------------+
|                                                                    |
| CURRENT POST: 245 characters base text                             |
|                                                                    |
| PLATFORM STATUS                                                    |
|                                                                    |
| Twitter/X   [======================----] 245/280                   |
|             [OK] 35 characters remaining                           |
|                                                                    |
| LinkedIn    [====---------------------------] 245/3000             |
|             [OK] 2,755 characters remaining                        |
|                                                                    |
| Instagram   [===========-------------------] 245/2200              |
|             [OK] 1,955 characters remaining                        |
|                                                                    |
| Threads     [=========================-----] 245/500               |
|             [OK] 255 characters remaining                          |
|                                                                    |
| Pinterest   [=========================-----] 245/500               |
|             [Warning] At 49% - keep it concise for engagement      |
|                                                                    |
+------------------------------------------------------------------+
```

#### Overflow Warning Modal

```
+------------------------------------------------------------------+
| [Warning] Character Limit Exceeded                            [X] |
+------------------------------------------------------------------+
|                                                                    |
| Your post exceeds the character limit for Twitter/X.               |
|                                                                    |
| CURRENT: 312 characters                                            |
| LIMIT: 280 characters                                              |
| OVER BY: 32 characters                                             |
|                                                                    |
| OPTIONS                                                            |
|                                                                    |
| [1] AI-Shorten                                                     |
|     Let AI condense your message while preserving meaning          |
|     +-------------------------------------------------------+     |
|     | ORIGINAL:                                             |     |
|     | "We're thrilled to announce our newest feature that   |     |
|     | revolutionizes how you manage content across          |     |
|     | multiple platforms simultaneously."                   |     |
|     |                                                       |     |
|     | SUGGESTED:                                            |     |
|     | "Excited to launch our new feature for seamless      |     |
|     | multi-platform content management!"                   |     |
|     +-------------------------------------------------------+     |
|     [Apply Suggestion]                                             |
|                                                                    |
| [2] Create Thread                                                  |
|     Split into multiple connected tweets                           |
|     [Create 2-Part Thread]                                         |
|                                                                    |
| [3] Edit Manually                                                  |
|     Trim your message yourself                                     |
|     [Edit Post]                                                    |
|                                                                    |
| [4] Skip Platform                                                  |
|     Don't post to Twitter/X                                        |
|     [Remove Twitter/X]                                             |
|                                                                    |
+------------------------------------------------------------------+
```

### 2.4 Media Requirements Check

```
+------------------------------------------------------------------+
| Media Compatibility Check                                          |
+------------------------------------------------------------------+
|                                                                    |
| UPLOADED: feature-video.mp4 (45 seconds, 1920x1080, 28MB)          |
|                                                                    |
| PLATFORM COMPATIBILITY                                             |
|                                                                    |
| +-------------------------------------------------------------+   |
| | Twitter/X                                          [Pass]   |   |
| | Duration: 45s (max 2:20) | Size: 28MB (max 512MB)           |   |
| | Resolution: 1920x1080 (optimal)                             |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| +-------------------------------------------------------------+   |
| | Instagram Feed                                     [Pass]   |   |
| | Duration: 45s (max 60s) | Size: 28MB (max 100MB)            |   |
| | Aspect ratio: 16:9 (supported, consider 1:1 or 4:5)         |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| +-------------------------------------------------------------+   |
| | Instagram Reels                                    [Pass]   |   |
| | Duration: 45s (max 90s) | Size: 28MB (max 100MB)            |   |
| | Resolution: 1920x1080 (will be cropped to 9:16)             |   |
| | [Preview Crop] [Skip Reels]                                 |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| +-------------------------------------------------------------+   |
| | TikTok                                             [Warning]|   |
| | Duration: 45s (max 3min) | Size: 28MB (max 72MB)            |   |
| | [!] Video should be 9:16 vertical for best performance      |   |
| | [Create Vertical Version] [Post Anyway]                     |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| +-------------------------------------------------------------+   |
| | LinkedIn                                           [Pass]   |   |
| | Duration: 45s (max 10min) | Size: 28MB (max 200MB)          |   |
| | Resolution: 1920x1080 (optimal for professional content)    |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| +-------------------------------------------------------------+   |
| | YouTube Shorts                                     [Fail]   |   |
| | [X] Must be vertical (9:16) - Current: 16:9                 |   |
| | [X] Max 60 seconds - Current: 45s (OK)                      |   |
| | [Create Vertical Version] [Skip YouTube Shorts]             |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| ACTIONS                                                            |
| [Auto-Convert All] [Review Individually] [Proceed with Compatible] |
|                                                                    |
+------------------------------------------------------------------+
```

### 2.5 Hashtag Suggestions

```
+------------------------------------------------------------------+
| Hashtag Suggestions                                    [Settings]  |
+------------------------------------------------------------------+
|                                                                    |
| Based on your content about "AI content management"                |
|                                                                    |
| TRENDING NOW                                                       |
| +-------------------------------------------------------------+   |
| | #AI                    | 2.4M posts today  | [+Add]          |   |
| | #ContentCreation       | 890K posts today  | [+Add]          |   |
| | #SocialMediaMarketing  | 1.2M posts today  | [+Add]          |   |
| | #MarTech               | 234K posts today  | [+Add]          |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| NICHE RELEVANT                                                     |
| +-------------------------------------------------------------+   |
| | #ContentManagement     | 45K posts today   | [+Add]          |   |
| | #SocialMediaTools      | 28K posts today   | [+Add]          |   |
| | #AIMarketing           | 67K posts today   | [+Add]          |   |
| | #ContentStrategy       | 89K posts today   | [+Add]          |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| BRAND HASHTAGS                                                     |
| +-------------------------------------------------------------+   |
| | #YourBrand             | Your branded tag  | [+Add]          |   |
| | #YourProduct           | Product tag       | [+Add]          |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| CURRENTLY SELECTED (4)                                             |
| [#AI] [#ContentManagement] [#SocialMediaMarketing] [#YourBrand]    |
|                                                                    |
| PLATFORM RECOMMENDATIONS                                           |
| Twitter/X: 2-3 hashtags optimal (you have 4)                       |
| Instagram: 5-10 hashtags optimal (you have 4, add more)            |
| LinkedIn: 3-5 hashtags optimal (you have 4)                        |
|                                                                    |
| [Apply to All] [Customize Per Platform]                            |
+------------------------------------------------------------------+
```

### 2.6 Scheduling Interface

```
+------------------------------------------------------------------+
| Schedule Post                                                  [X] |
+------------------------------------------------------------------+
|                                                                    |
| WHEN TO POST                                                       |
|                                                                    |
| ( ) Post Now                                                       |
| (x) Schedule for Later                                             |
| ( ) Add to Queue                                                   |
| ( ) Optimal Time (AI-powered)                                      |
|                                                                    |
| DATE AND TIME                                                      |
| +-------------------------------------------------------------+   |
| | Date: [February 15, 2026    ] [Calendar Icon]               |   |
| | Time: [10:00 AM             ] [Clock Icon]                  |   |
| | Timezone: [America/New_York (EST) v]                        |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| AI INSIGHTS                                                        |
| +-------------------------------------------------------------+   |
| | [Chart] Best Times for Your Audience                        |   |
| |                                                              |   |
| |  Engagement Score by Hour (Your timezone)                   |   |
| |                                                              |   |
| |  100 |                    ***                               |   |
| |   80 |              ****      ****                          |   |
| |   60 |        ****                  ****                    |   |
| |   40 |  ****                              ****              |   |
| |   20 |                                          ****        |   |
| |    0 +-------------------------------------------->         |   |
| |      6AM  9AM  12PM  3PM  6PM  9PM  12AM                    |   |
| |                                                              |   |
| | Recommended: 10:00 AM - 11:00 AM (highest engagement)       |   |
| | Your selection: 10:00 AM [Optimal]                          |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| PLATFORM-SPECIFIC TIMING                                           |
| +-------------------------------------------------------------+   |
| | [ ] Use same time for all platforms                         |   |
| | [x] Optimize per platform                                   |   |
| |                                                              |   |
| | Twitter/X:  10:00 AM EST  (Peak: 9-11 AM)                   |   |
| | LinkedIn:   10:30 AM EST  (Peak: 10 AM-12 PM)               |   |
| | Instagram:  11:00 AM EST  (Peak: 11 AM-1 PM)                |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| RECURRING POST                                                     |
| +-------------------------------------------------------------+   |
| | [ ] Make this a recurring post                              |   |
| |     Repeat: [Weekly v]  Every: [1] week(s)                  |   |
| |     On: [ ]Mon [x]Tue [ ]Wed [ ]Thu [x]Fri [ ]Sat [ ]Sun    |   |
| |     Ends: ( )Never (x)After [10] occurrences ( )On [Date]   |   |
| +-------------------------------------------------------------+   |
|                                                                    |
|                    [Cancel]  [Schedule Post]                       |
+------------------------------------------------------------------+
```

---

## 3. Social Media Analytics

### 3.1 Analytics Dashboard Overview

```
+------------------------------------------------------------------+
| Social Media Analytics                      [Export] [Date Range v]|
+------------------------------------------------------------------+
| Feb 1 - Feb 28, 2026                                               |
+------------------------------------------------------------------+
|                                                                    |
| OVERVIEW                                                           |
| +-------------+ +-------------+ +-------------+ +-------------+    |
| | TOTAL       | | ENGAGEMENT  | | FOLLOWERS   | | POSTS       |    |
| | IMPRESSIONS | | RATE        | | GAINED      | | PUBLISHED   |    |
| |             | |             | |             | |             |    |
| | 1.2M        | | 4.8%        | | +2,847      | | 156         |    |
| | +15% vs     | | +0.3% vs    | | +12% vs     | | +8% vs      |    |
| | last month  | | last month  | | last month  | | last month  |    |
| +-------------+ +-------------+ +-------------+ +-------------+    |
|                                                                    |
| ENGAGEMENT OVER TIME                                               |
| +-------------------------------------------------------------+   |
| |                                                              |   |
| |  8K |                           ****                         |   |
| |  6K |        ****         ****      ****                     |   |
| |  4K |  ****      ****  ***              ****                 |   |
| |  2K |                                        ****            |   |
| |   0 +------------------------------------------------>      |   |
| |     Week 1    Week 2    Week 3    Week 4                     |   |
| |                                                              |   |
| | [---] Impressions  [***] Engagements  [ooo] Clicks           |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| PLATFORM BREAKDOWN                                                 |
| +-------------------------------------------------------------+   |
| |                                                              |   |
| | Twitter/X    [===================--------] 45%   540K       |   |
| | LinkedIn     [============---------------] 28%   336K       |   |
| | Instagram    [=========------------------] 18%   216K       |   |
| | Threads      [====-----------------------]  6%    72K       |   |
| | Other        [==--------------------------]  3%    36K       |   |
| |                                                              |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| TOP PERFORMING CONTENT                                             |
| +-------------------------------------------------------------+   |
| | #1 | "Announcing our new AI feature..."                     |   |
| |    | Twitter/X | Feb 15 | 45K impressions | 8.2% engagement |   |
| |    | [View Post] [Repurpose] [Boost]                        |   |
| |----|--------------------------------------------------------|   |
| | #2 | "Behind the scenes of our product..."                  |   |
| |    | Instagram | Feb 12 | 38K impressions | 6.8% engagement |   |
| |    | [View Post] [Repurpose] [Boost]                        |   |
| |----|--------------------------------------------------------|   |
| | #3 | "Industry insights: 5 trends for 2026"                 |   |
| |    | LinkedIn | Feb 8 | 32K impressions | 5.4% engagement   |   |
| |    | [View Post] [Repurpose] [Boost]                        |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### 3.2 Follower Growth Tracking

```
+------------------------------------------------------------------+
| Follower Analytics                                    [All Time v] |
+------------------------------------------------------------------+
|                                                                    |
| TOTAL FOLLOWERS ACROSS PLATFORMS                                   |
|                                                                    |
| 127,845 (+2,847 this month)                                        |
|                                                                    |
| GROWTH CHART                                                       |
| +-------------------------------------------------------------+   |
| |                                                              |   |
| | 130K |                                            ****       |   |
| | 125K |                              ****  ****  **           |   |
| | 120K |                    ****  ****                         |   |
| | 115K |          ****  ****                                   |   |
| | 110K |  ****  **                                             |   |
| |      +----------------------------------------------------> |   |
| |      Oct   Nov   Dec   Jan   Feb   Mar   Apr   May          |   |
| |                                                              |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| BY PLATFORM                                                        |
| +-------------------------------------------------------------+   |
| | Platform     | Followers | This Month | Growth Rate | Trend |   |
| |--------------|-----------|------------|-------------|-------|   |
| | Twitter/X    | 45,230    | +892       | +2.0%       | [Up]  |   |
| | LinkedIn     | 38,450    | +1,245     | +3.3%       | [Up]  |   |
| | Instagram    | 28,920    | +512       | +1.8%       | [Up]  |   |
| | Threads      | 12,345    | +198       | +1.6%       | [--]  |   |
| | TikTok       | 2,900     | +0         | --          | [New] |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| AUDIENCE DEMOGRAPHICS                                              |
| +---------------------+ +----------------------+ +--------------+  |
| | AGE                 | | LOCATION             | | INTERESTS    |  |
| |---------------------| |----------------------| |--------------|  |
| | 18-24: 15%          | | USA: 45%             | | Tech: 78%    |  |
| | 25-34: 42%          | | UK: 12%              | | Business: 65%|  |
| | 35-44: 28%          | | Canada: 8%           | | Marketing:52%|  |
| | 45-54: 10%          | | Germany: 6%          | | AI: 48%      |  |
| | 55+: 5%             | | Other: 29%           | | Startups: 41%|  |
| +---------------------+ +----------------------+ +--------------+  |
|                                                                    |
| FOLLOWER QUALITY SCORE                                             |
| +-------------------------------------------------------------+   |
| | Overall Score: 78/100 [Good]                                |   |
| |                                                              |   |
| | Engagement Rate:     [==================--] 82/100          |   |
| | Audience Relevance:  [================----] 75/100          |   |
| | Growth Velocity:     [=================---] 77/100          |   |
| | Bot/Fake Accounts:   [=-------------------]  5% detected    |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### 3.3 Post Performance Comparison

```
+------------------------------------------------------------------+
| Content Performance Comparison                                     |
+------------------------------------------------------------------+
| Compare up to 4 posts                          [Add Post] [Clear]  |
+------------------------------------------------------------------+
|                                                                    |
| SELECTED POSTS                                                     |
|                                                                    |
| +---------------------------+---------------------------+          |
| | Post A                    | Post B                    |          |
| |---------------------------|---------------------------|          |
| | "New AI feature..."       | "Behind the scenes..."    |          |
| | Twitter/X | Feb 15        | Instagram | Feb 12        |          |
| +---------------------------+---------------------------+          |
| | Post C                    | Post D                    |          |
| |---------------------------|---------------------------|          |
| | "Industry insights..."    | "Team spotlight..."       |          |
| | LinkedIn | Feb 8          | Threads | Feb 5           |          |
| +---------------------------+---------------------------+          |
|                                                                    |
| COMPARISON METRICS                                                 |
| +-------------------------------------------------------------+   |
| |                | Post A  | Post B  | Post C  | Post D       |   |
| |----------------|---------|---------|---------|--------------|   |
| | Impressions    | 45,230  | 38,120  | 32,450  | 12,890       |   |
| | Engagements    | 3,712   | 2,592   | 1,752   | 845          |   |
| | Engagement %   | 8.2%    | 6.8%    | 5.4%    | 6.6%         |   |
| | Clicks         | 1,245   | 892     | 678     | 234          |   |
| | Shares/Retweets| 456     | 234     | 189     | 78           |   |
| | Comments       | 89      | 156     | 67      | 45           |   |
| | Saves/Bookmarks| 234     | 312     | 145     | 89           |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| VISUAL COMPARISON                                                  |
| +-------------------------------------------------------------+   |
| |                                                              |   |
| |  Impressions   Engagement   Clicks     Shares                |   |
| |                                                              |   |
| |  ****          ****         ****       ****      Post A      |   |
| |  ***           ***          ***        **        Post B      |   |
| |  **            **           **         *         Post C      |   |
| |  *             *            *          *         Post D      |   |
| |                                                              |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| INSIGHTS                                                           |
| +-------------------------------------------------------------+   |
| | [Lightbulb] Post A had the highest engagement - consider     |   |
| |             replicating its format (announcement + visual)   |   |
| |                                                              |   |
| | [Lightbulb] Post B's high comment count suggests audience    |   |
| |             prefers behind-the-scenes content                |   |
| |                                                              |   |
| | [Lightbulb] LinkedIn posts perform best mid-week (Post C    |   |
| |             was posted on Saturday - suboptimal)             |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### 3.4 Best Time to Post Analysis

```
+------------------------------------------------------------------+
| Best Time to Post                                      [Platform v]|
+------------------------------------------------------------------+
| Showing: All Platforms | Based on last 90 days                     |
+------------------------------------------------------------------+
|                                                                    |
| ENGAGEMENT HEATMAP                                                 |
| +-------------------------------------------------------------+   |
| |       Mon   Tue   Wed   Thu   Fri   Sat   Sun               |   |
| |  6AM  [  ]  [  ]  [  ]  [  ]  [  ]  [  ]  [  ]              |   |
| |  7AM  [  ]  [**]  [**]  [**]  [  ]  [  ]  [  ]              |   |
| |  8AM  [**]  [***] [***] [***] [**]  [  ]  [  ]              |   |
| |  9AM  [***] [****][****][****][***] [  ]  [  ]              |   |
| | 10AM  [****][****][****][****][****][**]  [  ]              |   |
| | 11AM  [****][****][***] [***] [****][***] [*]               |   |
| | 12PM  [***] [***] [***] [***] [***] [***] [**]              |   |
| |  1PM  [**]  [**]  [**]  [**]  [**]  [***] [***]             |   |
| |  2PM  [**]  [**]  [**]  [**]  [**]  [***] [***]             |   |
| |  3PM  [***] [***] [***] [***] [***] [**]  [**]              |   |
| |  4PM  [***] [***] [***] [***] [***] [*]   [*]               |   |
| |  5PM  [****][****][****][****][***] [*]   [*]               |   |
| |  6PM  [***] [***] [***] [***] [**]  [*]   [*]               |   |
| |  7PM  [**]  [**]  [**]  [**]  [*]   [*]   [*]               |   |
| |  8PM  [*]   [*]   [*]   [*]   [*]   [*]   [*]               |   |
| |                                                              |   |
| | Legend: [****] Best  [***] Good  [**] Average  [*] Low      |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| TOP POSTING WINDOWS                                                |
| +-------------------------------------------------------------+   |
| | #1  Tuesday & Wednesday 10:00 AM                             |   |
| |     Average engagement: 8.2%                                 |   |
| |     [Schedule Post for This Time]                            |   |
| |------------------------------------------------------------|   |
| | #2  Thursday 5:00 PM                                         |   |
| |     Average engagement: 7.8%                                 |   |
| |     [Schedule Post for This Time]                            |   |
| |------------------------------------------------------------|   |
| | #3  Monday 10:00 AM                                          |   |
| |     Average engagement: 7.5%                                 |   |
| |     [Schedule Post for This Time]                            |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| PLATFORM-SPECIFIC RECOMMENDATIONS                                  |
| +-------------------------------------------------------------+   |
| | Twitter/X:  Best: Tue-Thu 9-11 AM | Avoid: Weekends         |   |
| | LinkedIn:   Best: Tue-Thu 10 AM-12 PM | Avoid: Fri-Sun       |   |
| | Instagram:  Best: Mon-Fri 11 AM-1 PM | Good: Sat 10 AM       |   |
| | Threads:    Best: Daily 12-2 PM | Experimental platform      |   |
| | TikTok:     Best: Tue-Thu 7-9 PM | Leisure hours preferred   |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### 3.5 ROI Calculation Dashboard

```
+------------------------------------------------------------------+
| Social Media ROI                              [This Quarter v]     |
+------------------------------------------------------------------+
|                                                                    |
| INVESTMENT                                                         |
| +-------------------------------------------------------------+   |
| | Content Creation:          $12,500                           |   |
| | Paid Promotions:           $8,200                            |   |
| | Tools & Software:          $450                              |   |
| | Team Time (estimated):     $15,000                           |   |
| |-------------------------------------------------------------|   |
| | TOTAL INVESTMENT:          $36,150                           |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| RETURNS                                                            |
| +-------------------------------------------------------------+   |
| | Direct Conversions:        $48,500 (245 conversions)         |   |
| | Attributed Revenue:        $23,200 (social-assisted)         |   |
| | Brand Value Increase:      $15,000 (estimated)               |   |
| |-------------------------------------------------------------|   |
| | TOTAL RETURNS:             $86,700                           |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| ROI METRICS                                                        |
| +-------------+ +-------------+ +-------------+ +-------------+    |
| | ROI         | | ROAS        | | CAC         | | LTV:CAC     |    |
| |             | | (Paid)      | | (Social)    | | Ratio       |    |
| |             | |             | |             | |             |    |
| | 139.8%      | | 5.9x        | | $42.50      | | 4.2:1       |    |
| | [Excellent] | | [Above Avg] | | [Good]      | | [Healthy]   |    |
| +-------------+ +-------------+ +-------------+ +-------------+    |
|                                                                    |
| CONVERSION FUNNEL                                                  |
| +-------------------------------------------------------------+   |
| |                                                              |   |
| | Impressions:  1,245,000                                      |   |
| |      |                                                       |   |
| |      v  (3.2% CTR)                                           |   |
| | Website Visits:  39,840                                      |   |
| |      |                                                       |   |
| |      v  (12.5% engagement)                                   |   |
| | Engaged Visitors:  4,980                                     |   |
| |      |                                                       |   |
| |      v  (4.9% conversion)                                    |   |
| | Conversions:  245                                            |   |
| |                                                              |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| BY PLATFORM                                                        |
| +-------------------------------------------------------------+   |
| | Platform   | Investment | Revenue | ROI    | Conv. Rate     |   |
| |------------|------------|---------|--------|----------------|   |
| | Twitter/X  | $8,200     | $22,400 | 173%   | 5.2%           |   |
| | LinkedIn   | $12,500    | $38,200 | 206%   | 6.8%           |   |
| | Instagram  | $10,200    | $18,500 | 81%    | 3.9%           |   |
| | Threads    | $2,500     | $4,800  | 92%    | 4.1%           |   |
| | Other      | $2,750     | $2,800  | 2%     | 1.2%           |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### 3.6 Competitor Tracking (Optional Feature)

```
+------------------------------------------------------------------+
| Competitor Analysis                           [+ Add Competitor]   |
+------------------------------------------------------------------+
|                                                                    |
| TRACKED COMPETITORS (3)                                            |
|                                                                    |
| +-------------------------------------------------------------+   |
| | Competitor A                                                 |   |
| | @competitor_a                                                |   |
| |                                                              |   |
| | Followers: 125K (+5% vs you) | Engagement: 5.2% (+0.4% vs you)|   |
| | Posts/Week: 18 (vs your 12) | Avg Likes: 2.3K                |   |
| |                                                              |   |
| | Recent Activity: 3 posts in last 24h                         |   |
| | [View Profile] [Compare] [Remove]                            |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| COMPARATIVE METRICS                                                |
| +-------------------------------------------------------------+   |
| |              | You      | Comp A  | Comp B  | Comp C        |   |
| |--------------|----------|---------|---------|---------------|   |
| | Followers    | 127.8K   | 125K    | 89K     | 156K          |   |
| | Engagement   | 4.8%     | 5.2%    | 3.9%    | 4.1%          |   |
| | Posts/Week   | 12       | 18      | 8       | 22            |   |
| | Growth/Month | +2.2%    | +1.8%   | +3.1%   | +0.9%         |   |
| | Avg Response | 45min    | 2hr     | 30min   | 4hr           |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| CONTENT STRATEGY ANALYSIS                                          |
| +-------------------------------------------------------------+   |
| | Competitor A focuses on:                                     |   |
| | - Product tutorials (35% of content)                         |   |
| | - Industry news (28% of content)                             |   |
| | - Behind-the-scenes (22% of content)                         |   |
| | - User testimonials (15% of content)                         |   |
| |                                                              |   |
| | [Lightbulb] They post more tutorials - you could increase    |   |
| |             educational content for better engagement        |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| SHARE OF VOICE                                                     |
| +-------------------------------------------------------------+   |
| |                                                              |   |
| | Industry Mentions (last 30 days)                             |   |
| |                                                              |   |
| | You:        [=================--------] 32%                  |   |
| | Comp A:     [=================---------] 28%                 |   |
| | Comp B:     [==========---------------] 18%                  |   |
| | Comp C:     [============-------------] 22%                  |   |
| |                                                              |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

---

## 4. Content Calendar

### 4.1 Visual Calendar View

#### Month View

```
+------------------------------------------------------------------+
| Content Calendar                     [<] February 2026 [>] [Today] |
+------------------------------------------------------------------+
| [Month] [Week] [Day] [Queue]                   [+ Schedule Post]   |
+------------------------------------------------------------------+
|                                                                    |
| +------+------+------+------+------+------+------+                 |
| | Sun  | Mon  | Tue  | Wed  | Thu  | Fri  | Sat  |                 |
| +------+------+------+------+------+------+------+                 |
| |      |      |      |      |      |      |  1   |                 |
| |      |      |      |      |      |      |      |                 |
| +------+------+------+------+------+------+------+                 |
| |  2   |  3   |  4   |  5   |  6   |  7   |  8   |                 |
| |      |[TW]  |[TW]  |[LI]  |[TW]  |      |      |                 |
| |      |[IN]  |      |[TW]  |[IN]  |      |      |                 |
| +------+------+------+------+------+------+------+                 |
| |  9   | 10   | 11   | 12   | 13   | 14   | 15   |                 |
| |      |[TW]  |[LI]  |[IN]  |[TW]  |[ALL] |[TW]  |                 |
| |      |      |[TW]  |[TW]  |      |[5]   |[IN]  |                 |
| +------+------+------+------+------+------+------+                 |
| | 16   | 17   | 18   | 19   | 20   | 21   | 22   |                 |
| |      |[TW]  |[LI]  |[TW]  |[TW]  |      |      |                 |
| |      |      |      |[IN]  |      |      |      |                 |
| +------+------+------+------+------+------+------+                 |
| | 23   | 24   | 25   | 26   | 27   | 28   |      |                 |
| |      |[TW]  |[TW]  |[LI]  |[TW]  |      |      |                 |
| |      |      |[IN]  |      |      |      |      |                 |
| +------+------+------+------+------+------+------+                 |
|                                                                    |
| LEGEND                                                             |
| [TW] Twitter/X  [LI] LinkedIn  [IN] Instagram  [TH] Threads        |
| [FB] Facebook   [TK] TikTok    [YT] YouTube    [PT] Pinterest      |
|                                                                    |
| THIS MONTH: 34 posts scheduled | 12 published | 22 pending         |
|                                                                    |
+------------------------------------------------------------------+
```

#### Week View

```
+------------------------------------------------------------------+
| Content Calendar - Week of Feb 10-16, 2026                         |
+------------------------------------------------------------------+
| [Month] [Week] [Day] [Queue]                   [+ Schedule Post]   |
+------------------------------------------------------------------+
|                                                                    |
|        | Mon 10  | Tue 11  | Wed 12  | Thu 13  | Fri 14  | Sat 15 |
| +------+---------+---------+---------+---------+---------+--------+
| | 6 AM |         |         |         |         |         |        |
| +------+---------+---------+---------+---------+---------+--------+
| | 8 AM |         |         |         |         |         |        |
| +------+---------+---------+---------+---------+---------+--------+
| |10 AM | [TW]    | [LI]    |         | [TW]    | [TW]    | [TW]   |
| |      | Feature | Article |         | Tips    | Launch  | Recap  |
| |      | Announ..|         |         |         | Day!    |        |
| +------+---------+---------+---------+---------+---------+--------+
| |12 PM |         | [TW]    | [IN]    |         | [LI]    | [IN]   |
| |      |         | Thread  | Carousel|         | Launch  | Story  |
| |      |         |         |         |         | Post    |        |
| +------+---------+---------+---------+---------+---------+--------+
| | 2 PM |         |         | [TW]    |         | [IN]    |        |
| |      |         |         | Poll    |         | Launch  |        |
| |      |         |         |         |         | Reel    |        |
| +------+---------+---------+---------+---------+---------+--------+
| | 4 PM |         |         |         |         | [TH]    |        |
| |      |         |         |         |         | Quick   |        |
| |      |         |         |         |         | Update  |        |
| +------+---------+---------+---------+---------+---------+--------+
| | 6 PM |         |         |         |         | [TK]    |        |
| |      |         |         |         |         | Launch  |        |
| |      |         |         |         |         | Video   |        |
| +------+---------+---------+---------+---------+---------+--------+
|                                                                    |
| Click any cell to add post | Drag posts to reschedule              |
+------------------------------------------------------------------+
```

### 4.2 Drag-Drop Scheduling

#### Drag State Visualization

```
+------------------------------------------------------------------+
| Dragging: "Feature Announcement"                                   |
+------------------------------------------------------------------+
|                                                                    |
| Original: Tuesday 10 AM                                            |
|                                                                    |
|        | Mon 10  | Tue 11  | Wed 12  | Thu 13  | Fri 14  |        |
| +------+---------+---------+---------+---------+---------+        |
| |10 AM |         | [-----] | [Drop   | [Drop   | [X]     |        |
| |      |         | Drag    |  Here]  |  Here]  | Launch  |        |
| |      |         | Source  | [OK]    | [OK]    | Day     |        |
| +------+---------+---------+---------+---------+---------+        |
| |12 PM | [Drop   |         | [Drop   |         |         |        |
| |      |  Here]  |         |  Here]  |         |         |        |
| |      | [OK]    |         | [!]     |         |         |        |
| +------+---------+---------+---------+---------+---------+        |
|                                                                    |
| Drop Indicators:                                                   |
| [OK] - Optimal time for this content                               |
| [!]  - Not recommended (low engagement expected)                   |
| [X]  - Conflicts with existing post                                |
|                                                                    |
+------------------------------------------------------------------+
```

#### Drop Confirmation

```
+------------------------------------------------------------------+
| Reschedule Post                                               [X] |
+------------------------------------------------------------------+
|                                                                    |
| Moving "Feature Announcement"                                      |
|                                                                    |
| FROM: Tuesday, Feb 11 at 10:00 AM                                  |
| TO:   Wednesday, Feb 12 at 10:00 AM                                |
|                                                                    |
| AI ANALYSIS                                                        |
| +-------------------------------------------------------------+   |
| | [Check] New time has similar engagement potential            |   |
| | [Check] No posting conflicts                                 |   |
| | [Info] Wednesday typically has 5% higher engagement          |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| AFFECTED POSTS                                                     |
| +-------------------------------------------------------------+   |
| | None - this change doesn't affect other scheduled posts      |   |
| +-------------------------------------------------------------+   |
|                                                                    |
|              [Cancel]  [Confirm Reschedule]                        |
+------------------------------------------------------------------+
```

### 4.3 Platform Color Coding

```css
/* Platform Color System */
:root {
  /* Primary Platform Colors */
  --platform-twitter: #000000;
  --platform-facebook: #1877F2;
  --platform-instagram: #E4405F;
  --platform-linkedin: #0A66C2;
  --platform-tiktok: #000000;
  --platform-youtube: #FF0000;
  --platform-pinterest: #BD081C;
  --platform-threads: #000000;
  --platform-mastodon: #6364FF;

  /* Calendar Event Colors (lighter for backgrounds) */
  --event-twitter: rgba(0, 0, 0, 0.1);
  --event-facebook: rgba(24, 119, 242, 0.1);
  --event-instagram: rgba(228, 64, 95, 0.1);
  --event-linkedin: rgba(10, 102, 194, 0.1);
  --event-tiktok: rgba(0, 0, 0, 0.1);
  --event-youtube: rgba(255, 0, 0, 0.1);
  --event-pinterest: rgba(189, 8, 28, 0.1);
  --event-threads: rgba(0, 0, 0, 0.1);
  --event-mastodon: rgba(99, 100, 255, 0.1);

  /* Multi-platform gradient */
  --event-multi: linear-gradient(135deg,
    var(--platform-twitter) 0%,
    var(--platform-linkedin) 50%,
    var(--platform-instagram) 100%);
}
```

### 4.4 Approval Workflows

#### Workflow Configuration

```
+------------------------------------------------------------------+
| Approval Workflow Settings                                         |
+------------------------------------------------------------------+
|                                                                    |
| CURRENT WORKFLOW: Two-Stage Approval                               |
|                                                                    |
| WORKFLOW STAGES                                                    |
| +-------------------------------------------------------------+   |
| |                                                              |   |
| | [1] DRAFT --> [2] REVIEW --> [3] APPROVED --> [4] SCHEDULED |   |
| |     |             |              |                |          |   |
| |   Author        Editor         Manager          System       |   |
| |   creates       reviews        approves         publishes    |   |
| |                                                              |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| APPROVAL RULES                                                     |
| +-------------------------------------------------------------+   |
| | [ ] Require approval for all posts                          |   |
| | [x] Require approval for external links                     |   |
| | [x] Require approval for posts mentioning competitors       |   |
| | [x] Require approval for posts over $100 in promoted value  |   |
| | [ ] Require legal review for product claims                 |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| APPROVERS BY ROLE                                                  |
| +-------------------------------------------------------------+   |
| | Stage 2 (Review)   | Marketing Team, Content Leads          |   |
| | Stage 3 (Approval) | Marketing Manager, Social Media Lead   |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| NOTIFICATIONS                                                      |
| +-------------------------------------------------------------+   |
| | [x] Email approvers when content is ready for review        |   |
| | [x] Slack notification to #social-approvals channel         |   |
| | [x] Reminder after 24 hours if not approved                 |   |
| | [x] Notify author when approved or rejected                 |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

#### Approval Request View

```
+------------------------------------------------------------------+
| Pending Approvals                                    [5 Pending]   |
+------------------------------------------------------------------+
|                                                                    |
| NEEDS YOUR APPROVAL                                                |
|                                                                    |
| +-------------------------------------------------------------+   |
| | [Urgent] Product Launch Announcement                        |   |
| |          Twitter/X + LinkedIn + Instagram                   |   |
| |          Scheduled: Feb 14, 10:00 AM (in 2 days)           |   |
| |          Submitted by: Sarah K. | 4 hours ago               |   |
| |                                                              |   |
| | Preview:                                                     |   |
| | "Exciting news! We're launching our biggest update yet..."   |   |
| |                                                              |   |
| | [View Full Post]  [Approve]  [Request Changes]  [Reject]    |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| +-------------------------------------------------------------+   |
| | Industry Insights Thread                                    |   |
| |          Twitter/X                                          |   |
| |          Scheduled: Feb 15, 2:00 PM (in 3 days)            |   |
| |          Submitted by: Mike T. | 1 day ago                  |   |
| |                                                              |   |
| | Preview:                                                     |   |
| | "Thread: 5 trends shaping content marketing in 2026..."     |   |
| |                                                              |   |
| | [View Full Post]  [Approve]  [Request Changes]  [Reject]    |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| APPROVAL HISTORY                                                   |
| +-------------------------------------------------------------+   |
| | [Approved] Behind the Scenes Video - Feb 10                 |   |
| | [Approved] Weekly Roundup Post - Feb 9                      |   |
| | [Changes Requested] Partner Spotlight - Feb 8               |   |
| | [Approved] Team Anniversary Post - Feb 7                    |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

#### Request Changes Modal

```
+------------------------------------------------------------------+
| Request Changes                                               [X] |
+------------------------------------------------------------------+
|                                                                    |
| POST: Product Launch Announcement                                  |
| AUTHOR: Sarah K.                                                   |
|                                                                    |
| WHAT NEEDS TO CHANGE?                                              |
| +-------------------------------------------------------------+   |
| | [x] Copy/Text needs revision                                |   |
| | [ ] Image/Media needs update                                |   |
| | [ ] Hashtags need adjustment                                |   |
| | [ ] Timing needs reconsideration                            |   |
| | [ ] Platform selection needs review                         |   |
| | [ ] Other                                                   |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| SPECIFIC FEEDBACK                                                  |
| +-------------------------------------------------------------+   |
| | Please revise the second paragraph to include our new       |   |
| | tagline "Smarter Content, Better Results" and ensure we     |   |
| | mention the free trial offer.                               |   |
| |                                                              |   |
| | Also, the scheduled time conflicts with our email campaign  |   |
| | - can we move it to 11 AM instead?                          |   |
| |                                                              |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| PRIORITY                                                           |
| ( ) Low - No rush                                                  |
| (x) Medium - Please address within 24 hours                        |
| ( ) High - Blocking launch, address immediately                    |
|                                                                    |
|              [Cancel]  [Send Feedback]                             |
+------------------------------------------------------------------+
```

### 4.5 Team Collaboration

```
+------------------------------------------------------------------+
| Team Activity                                        [All Teams v] |
+------------------------------------------------------------------+
|                                                                    |
| CURRENTLY WORKING                                                  |
| +-------------------------------------------------------------+   |
| | [Avatar] Sarah K. is editing "Product Launch Announcement"  |   |
| |          Started 15 minutes ago                              |   |
| |          [View] [Message]                                    |   |
| |------------------------------------------------------------|   |
| | [Avatar] Mike T. is reviewing scheduled posts for next week |   |
| |          Started 30 minutes ago                              |   |
| |          [View] [Message]                                    |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| RECENT ACTIVITY                                                    |
| +-------------------------------------------------------------+   |
| | [Avatar] Lisa M. approved 3 posts for publishing             |   |
| |          2 hours ago                                         |   |
| |------------------------------------------------------------|   |
| | [Avatar] John D. created new content template "Announcement" |   |
| |          3 hours ago                                         |   |
| |------------------------------------------------------------|   |
| | [Avatar] Sarah K. scheduled 5 posts for Valentine's campaign |   |
| |          Yesterday at 4:30 PM                                |   |
| |------------------------------------------------------------|   |
| | [Avatar] Mike T. added competitor @rival_brand to tracking   |   |
| |          Yesterday at 2:15 PM                                |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| TEAM PERFORMANCE THIS WEEK                                         |
| +-------------------------------------------------------------+   |
| | Team Member    | Posts Created | Approved | Engagement       |   |
| |----------------|---------------|----------|------------------|   |
| | Sarah K.       | 12            | 10       | 5.2% avg         |   |
| | Mike T.        | 8             | 7        | 4.8% avg         |   |
| | Lisa M.        | 5             | 5        | 6.1% avg         |   |
| | John D.        | 3             | 3        | 4.5% avg         |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### 4.6 Content Recycling

```
+------------------------------------------------------------------+
| Content Recycling                                    [Settings]    |
+------------------------------------------------------------------+
|                                                                    |
| EVERGREEN CONTENT LIBRARY                                          |
| Posts marked as evergreen can be automatically recycled            |
|                                                                    |
| +-------------------------------------------------------------+   |
| | [Star] "5 Tips for Better Content Management"               |   |
| |        Originally posted: Jan 15 | Performance: 6.2% eng.   |   |
| |        Last recycled: Feb 1 | Times recycled: 3             |   |
| |        Next suggested: March 1 (30 day interval)            |   |
| |                                                              |   |
| |        Platforms: [TW] [LI]                                  |   |
| |        [Edit] [Recycle Now] [Remove from Evergreen]         |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| +-------------------------------------------------------------+   |
| | [Star] "How We Built Our AI-Powered Platform"               |   |
| |        Originally posted: Dec 10 | Performance: 8.1% eng.   |   |
| |        Last recycled: Jan 10 | Times recycled: 2            |   |
| |        Next suggested: Feb 10 (30 day interval)             |   |
| |                                                              |   |
| |        Platforms: [TW] [LI] [TH]                             |   |
| |        [Edit] [Recycle Now] [Remove from Evergreen]         |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| RECYCLING SETTINGS                                                 |
| +-------------------------------------------------------------+   |
| | Minimum interval between recycles: [30] days                |   |
| | Maximum recycles per post: [5] times                        |   |
| | Auto-recycle evergreen content: [x] Enabled                 |   |
| | Variation requirement: [x] Require text variation           |   |
| | Performance threshold: [4]% minimum engagement              |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| AI VARIATION SUGGESTIONS                                           |
| +-------------------------------------------------------------+   |
| | Original: "5 Tips for Better Content Management"             |   |
| |                                                              |   |
| | Variation 1: "Still struggling with content? Here are 5     |   |
| |               proven tips that work"                         |   |
| |                                                              |   |
| | Variation 2: "Content management doesn't have to be hard.   |   |
| |               Start with these 5 tips"                       |   |
| |                                                              |   |
| | Variation 3: "Your content workflow needs these 5 essential |   |
| |               tips for success"                              |   |
| |                                                              |   |
| | [Use Variation 1] [Use Variation 2] [Use Variation 3]       |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

---

## 5. Platform-Specific Adaptations

### 5.1 Twitter/X Specific Features

```
+------------------------------------------------------------------+
| Twitter/X Post Options                                             |
+------------------------------------------------------------------+
|                                                                    |
| POST TYPE                                                          |
| (x) Single Tweet                                                   |
| ( ) Thread (multiple connected tweets)                             |
| ( ) Quote Tweet (reference another tweet)                          |
| ( ) Reply (to an existing tweet)                                   |
|                                                                    |
| THREAD COMPOSER (when Thread selected)                             |
| +-------------------------------------------------------------+   |
| | Tweet 1 of 5                                                |   |
| | +-------------------------------------------------------+   |   |
| | | Introducing our new feature! Built with AI to help    |   |   |
| | | you manage content smarter.                           |   |   |
| | |                                                       |   |   |
| | | Thread continues below...                             |   |   |
| | +-------------------------------------------------------+   |   |
| | 142/280 characters                                          |   |
| |------------------------------------------------------------|   |
| | Tweet 2 of 5                                                |   |
| | +-------------------------------------------------------+   |   |
| | | Here's what makes it special:                         |   |   |
| | |                                                       |   |   |
| | | 1. AI-powered suggestions                             |   |   |
| | | 2. Multi-platform publishing                          |   |   |
| | | 3. Smart scheduling                                   |   |   |
| | +-------------------------------------------------------+   |   |
| | 156/280 characters                                          |   |
| +-------------------------------------------------------------+   |
| | [+ Add Tweet to Thread]                                      |   |
|                                                                    |
| POLL OPTIONS                                                       |
| +-------------------------------------------------------------+   |
| | [ ] Add a poll                                              |   |
| |     Option 1: [____________________]                        |   |
| |     Option 2: [____________________]                        |   |
| |     [+ Add Option] (up to 4)                                |   |
| |     Duration: [1 day v]                                     |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### 5.2 Instagram Specific Features

```
+------------------------------------------------------------------+
| Instagram Post Options                                             |
+------------------------------------------------------------------+
|                                                                    |
| POST TYPE                                                          |
| (x) Feed Post (single image/video)                                 |
| ( ) Carousel (up to 10 images/videos)                              |
| ( ) Reel (short-form video, up to 90s)                             |
| ( ) Story (24-hour temporary content)                              |
|                                                                    |
| CAROUSEL COMPOSER (when Carousel selected)                         |
| +-------------------------------------------------------------+   |
| | +-------+ +-------+ +-------+ +-------+ +-----+              |   |
| | |  1    | |  2    | |  3    | |  4    | | [+] |              |   |
| | | [Img] | | [Img] | | [Img] | | [Img] | | Add |              |   |
| | +-------+ +-------+ +-------+ +-------+ +-----+              |   |
| |                                                              |   |
| | Drag to reorder | Click to edit | Max 10 slides             |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| REELS OPTIONS (when Reel selected)                                 |
| +-------------------------------------------------------------+   |
| | Cover Image: [Select from video frame v]                    |   |
| | Audio: [Original Audio v] [Add Music]                       |   |
| | Also share to Feed: [x]                                     |   |
| | Enable Remix: [x]                                           |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| STORY OPTIONS (when Story selected)                                |
| +-------------------------------------------------------------+   |
| | Story Stickers:                                              |   |
| | [Poll] [Question] [Quiz] [Countdown] [Link] [Location]       |   |
| |                                                              |   |
| | Close Friends Only: [ ]                                      |   |
| | Allow Sharing: [x]                                           |   |
| | Allow Replies: (x) Everyone ( ) Following ( ) Off           |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| SHOPPING TAGS (if enabled)                                         |
| +-------------------------------------------------------------+   |
| | [ ] Tag products in this post                               |   |
| |     [+ Add Product Tag]                                     |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### 5.3 LinkedIn Specific Features

```
+------------------------------------------------------------------+
| LinkedIn Post Options                                              |
+------------------------------------------------------------------+
|                                                                    |
| POST TYPE                                                          |
| (x) Standard Post                                                  |
| ( ) Article (long-form content)                                    |
| ( ) Document/Carousel (PDF upload)                                 |
| ( ) Poll                                                           |
| ( ) Event                                                          |
|                                                                    |
| DOCUMENT CAROUSEL (when Document selected)                         |
| +-------------------------------------------------------------+   |
| | Upload PDF to create carousel post                          |   |
| | [Choose PDF] or drag and drop                               |   |
| |                                                              |   |
| | Guidelines:                                                  |   |
| | - Max 100MB file size                                        |   |
| | - Ideal dimensions: 1080x1080 or 1080x1350                   |   |
| | - Each page becomes a slide                                  |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| VISIBILITY SETTINGS                                                |
| +-------------------------------------------------------------+   |
| | Who can see this post:                                       |   |
| | (x) Anyone on or off LinkedIn                                |   |
| | ( ) Connections only                                         |   |
| | ( ) Group members (select group)                             |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| PROFESSIONAL FORMATTING                                            |
| +-------------------------------------------------------------+   |
| | [x] Add line breaks for readability                          |   |
| | [x] Use bullet points for lists                              |   |
| | [x] Add emojis sparingly (professional tone)                 |   |
| | [ ] Include a call-to-action                                 |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| AI TONE ADJUSTMENT                                                 |
| +-------------------------------------------------------------+   |
| | Current tone: [Professional v]                               |   |
| | Options: Casual | Professional | Thought Leader | Recruiter  |   |
| | [Apply Tone]                                                 |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### 5.4 TikTok Specific Features

```
+------------------------------------------------------------------+
| TikTok Post Options                                                |
+------------------------------------------------------------------+
|                                                                    |
| VIDEO REQUIREMENTS                                                 |
| +-------------------------------------------------------------+   |
| | [Check] Video is vertical (9:16) - Required for best reach  |   |
| | [Check] Duration under 3 minutes - Optimal: 15-60 seconds    |   |
| | [Warning] No copyrighted music detected                      |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| CAPTION                                                            |
| +-------------------------------------------------------------+   |
| | Check out our new feature! #ContentCreator #AI #Tech         |   |
| |                                                              |   |
| | 56/2200 characters                                           |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| COVER IMAGE                                                        |
| +-------------------------------------------------------------+   |
| | [Frame Selector Timeline]                                    |   |
| | +---+---+---+---+---+---+---+---+---+---+                    |   |
| | | * |   |   |   |   |   |   |   |   |   |                    |   |
| | +---+---+---+---+---+---+---+---+---+---+                    |   |
| | Selected: Frame at 0:03                                      |   |
| | [Upload Custom Cover]                                        |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| INTERACTION SETTINGS                                               |
| +-------------------------------------------------------------+   |
| | Allow Duet: [x]                                              |   |
| | Allow Stitch: [x]                                            |   |
| | Allow Comments: (x) Everyone ( ) Friends ( ) Off            |   |
| | Allow Downloads: [x]                                         |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| DISCLOSURE                                                         |
| +-------------------------------------------------------------+   |
| | [ ] This is a paid partnership/ad                           |   |
| | [ ] Contains promotional content                             |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

### 5.5 YouTube Specific Features

```
+------------------------------------------------------------------+
| YouTube Upload Options                                             |
+------------------------------------------------------------------+
|                                                                    |
| VIDEO TYPE                                                         |
| (x) Standard Video                                                 |
| ( ) YouTube Short (vertical, under 60s)                            |
|                                                                    |
| VIDEO DETAILS                                                      |
| +-------------------------------------------------------------+   |
| | Title: [Introducing Our New AI Feature_____________] 58/100 |   |
| |                                                              |   |
| | Description:                                                 |   |
| | +-------------------------------------------------------+   |   |
| | | Discover our newest feature powered by AI!            |   |   |
| | |                                                       |   |   |
| | | In this video:                                        |   |   |
| | | 00:00 - Introduction                                  |   |   |
| | | 00:30 - Feature Overview                              |   |   |
| | | 02:00 - Demo                                          |   |   |
| | | 05:00 - How to Get Started                            |   |   |
| | |                                                       |   |   |
| | | Links:                                                |   |   |
| | | Website: https://example.com                          |   |   |
| | +-------------------------------------------------------+   |   |
| | 312/5000 characters                                          |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| THUMBNAIL                                                          |
| +-------------------------------------------------------------+   |
| | [+] Upload Custom Thumbnail (recommended)                    |   |
| | Or select from auto-generated:                               |   |
| | +-------+ +-------+ +-------+                                |   |
| | | Auto1 | | Auto2 | | Auto3 |                                |   |
| | +-------+ +-------+ +-------+                                |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| VISIBILITY                                                         |
| +-------------------------------------------------------------+   |
| | ( ) Public                                                   |   |
| | ( ) Unlisted                                                 |   |
| | (x) Scheduled: [Feb 14, 2026] at [10:00 AM]                  |   |
| | ( ) Private                                                  |   |
| +-------------------------------------------------------------+   |
|                                                                    |
| MONETIZATION & SETTINGS                                            |
| +-------------------------------------------------------------+   |
| | [x] Allow embedding                                          |   |
| | [x] Notify subscribers                                       |   |
| | [ ] Premiere (live watch party)                              |   |
| | Category: [Science & Technology v]                           |   |
| | Tags: [AI, Content Management, Tech, Tutorial]               |   |
| +-------------------------------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
```

---

## 6. User Flows

### 6.1 Connect New Platform Flow

```
[Social Hub]
     |
     v
[+ Add Platform]
     |
     v
[Platform Selection Grid] -- Select "Instagram" --> [Instagram Card]
     |
     v
[Connection Modal]
     |
     +-- [Connect with Instagram] --> [Instagram OAuth Page]
     |                                       |
     |                                       v
     |                               [Authorize App]
     |                                       |
     +-- [Cancel] --> [Back to Hub]         |
                                            v
                               [Connection Success]
                                       |
                                       v
                               [Quick Setup]
                                       |
                                       +-- [Configure Settings]
                                       |
                                       v
                               [What's Next Options]
                                       |
                     +-----------------+-----------------+
                     |                 |                 |
                     v                 v                 v
             [Create Post]    [View Calendar]    [See Analytics]
```

### 6.2 Multi-Platform Post Creation Flow

```
[Dashboard or Calendar]
     |
     v
[+ Create Post] or [+ Schedule Post]
     |
     v
[Platform Selection]
     |
     +-- Select multiple platforms: [TW] [LI] [IN]
     |
     v
[Compose Screen]
     |
     +-- Write content
     +-- Add media
     +-- AI suggests hashtags, best times
     |
     v
[Content Adaptation Review]
     |
     +-- Review each platform's version
     +-- AI adapts tone/length per platform
     +-- Check character limits
     +-- Verify media compatibility
     |
     v
[Schedule Options]
     |
     +-- Post Now
     +-- Schedule for specific time
     +-- Use AI-recommended times
     +-- Add to queue
     |
     v
[Approval Check]
     |
     +-- Requires Approval? --> [Submit for Review] --> [Notify Approvers]
     |
     +-- No Approval Needed --> [Confirm & Schedule]
     |
     v
[Success Confirmation]
     |
     +-- View in Calendar
     +-- Create another post
     +-- Share internally
```

### 6.3 Analytics Review Flow

```
[Social Hub]
     |
     v
[Analytics Tab]
     |
     v
[Dashboard Overview]
     |
     +-- View key metrics
     +-- Platform breakdown
     +-- Top content
     |
     v
[Deep Dive Options]
     |
     +----------------+----------------+----------------+
     |                |                |                |
     v                v                v                v
[Follower      [Content         [Best Times    [ROI
 Analytics]     Performance]     Analysis]      Calculator]
     |                |                |                |
     v                v                v                v
[Growth        [Compare          [Heatmap       [Investment
 Charts]        Posts]            View]          vs Returns]
     |                |                |                |
     v                v                v                v
[Export        [Repurpose        [Schedule      [Generate
 Report]        Content]          Optimal]       Report]
```

### 6.4 Content Approval Flow

```
[Author Creates Post]
     |
     v
[Submit for Approval]
     |
     v
[System Notifications]
     |
     +-- Email to approvers
     +-- Slack notification
     +-- In-app notification
     |
     v
[Approver Reviews]
     |
     +----------------+----------------+----------------+
     |                |                |                |
     v                v                v                v
[Approve]      [Request         [Reject]         [Comment]
     |          Changes]              |                |
     v                |               v                v
[Schedule      [Return to        [Notify          [Discussion
 Post]          Author]           Author]          Thread]
     |                |               |                |
     |                v               v                |
     |          [Author              [Archive         |
     |           Revises]            or Delete]       |
     |                |                               |
     |                v                               |
     |          [Resubmit]<---------------------------+
     |                |
     +----------------+
     |
     v
[Post Goes Live at Scheduled Time]
```

### 6.5 Content Calendar Management Flow

```
[Calendar View]
     |
     +-- Select view: [Month] [Week] [Day] [Queue]
     |
     v
[View Scheduled Content]
     |
     +----------------+----------------+----------------+
     |                |                |                |
     v                v                v                v
[Click Empty    [Click Post      [Drag Post      [Filter by
 Cell]           to View]         to Reschedule]  Platform]
     |                |                |                |
     v                v                v                v
[Create New     [Post Detail     [Drop           [Show Only
 Post]           Modal]           Confirmation]   Selected]
     |                |                |                |
     |                +-- Edit         +-- Confirm     |
     |                +-- Duplicate    +-- Cancel      |
     |                +-- Delete                       |
     |                +-- Reschedule                   |
     |                                                 |
     v                                                 |
[Compose Screen]<-------------------------------------+
```

---

## 7. Component Specifications

### 7.1 PlatformSelector Component

```typescript
interface PlatformSelectorProps {
  availablePlatforms: Platform[];
  selectedPlatforms: Platform[];
  onSelectionChange: (platforms: Platform[]) => void;
  mode: 'single' | 'multi';
  showAccountSelector?: boolean;
  disabled?: boolean;
}

interface Platform {
  id: string;
  name: string;
  icon: React.ComponentType;
  color: string;
  connected: boolean;
  accounts?: Account[];
}

interface Account {
  id: string;
  handle: string;
  avatar: string;
  type: 'personal' | 'business' | 'creator';
}
```

### 7.2 PostComposer Component

```typescript
interface PostComposerProps {
  platforms: Platform[];
  initialContent?: string;
  onSave: (post: PostDraft) => void;
  onSchedule: (post: PostDraft, date: Date) => void;
  mode: 'create' | 'edit';
  enableAI?: boolean;
}

interface PostDraft {
  id?: string;
  content: string;
  platformContent: Map<PlatformId, PlatformContent>;
  media: MediaAttachment[];
  hashtags: string[];
  scheduledFor?: Date;
  status: 'draft' | 'scheduled' | 'pending_approval' | 'published';
}

interface PlatformContent {
  text: string;
  characterCount: number;
  isWithinLimit: boolean;
  platformSpecificOptions: Record<string, unknown>;
}
```

### 7.3 ContentCalendar Component

```typescript
interface ContentCalendarProps {
  view: 'month' | 'week' | 'day' | 'queue';
  posts: ScheduledPost[];
  onPostClick: (post: ScheduledPost) => void;
  onPostDrop: (post: ScheduledPost, newDate: Date) => void;
  onCreatePost: (date: Date) => void;
  platformFilter?: PlatformId[];
  teamFilter?: UserId[];
}

interface ScheduledPost {
  id: string;
  content: string;
  platforms: Platform[];
  scheduledFor: Date;
  author: User;
  status: PostStatus;
  approvalStatus?: ApprovalStatus;
}
```

### 7.4 AnalyticsDashboard Component

```typescript
interface AnalyticsDashboardProps {
  dateRange: DateRange;
  platforms?: PlatformId[];
  metrics: MetricType[];
  onExport: (format: 'pdf' | 'csv' | 'json') => void;
}

interface DateRange {
  start: Date;
  end: Date;
  preset?: 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
}

type MetricType =
  | 'impressions'
  | 'engagements'
  | 'followers'
  | 'clicks'
  | 'shares'
  | 'comments'
  | 'reach'
  | 'conversions';
```

### 7.5 ApprovalWorkflow Component

```typescript
interface ApprovalWorkflowProps {
  post: PostDraft;
  workflow: WorkflowConfig;
  currentStage: number;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onRequestChanges: (feedback: ChangeFeedback) => void;
}

interface WorkflowConfig {
  stages: WorkflowStage[];
  rules: ApprovalRule[];
  notifications: NotificationConfig;
}

interface WorkflowStage {
  id: string;
  name: string;
  approvers: User[];
  requiredApprovals: number;
}
```

### 7.6 CharacterCounter Component

```typescript
interface CharacterCounterProps {
  text: string;
  platform: Platform;
  showWarningAt?: number; // percentage
  showProgressBar?: boolean;
  onOverLimit?: () => void;
}

// Visual states
type CounterState = 'ok' | 'warning' | 'error';

// Color mappings
const stateColors = {
  ok: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)'
};
```

### 7.7 MediaCompatibilityChecker Component

```typescript
interface MediaCompatibilityCheckerProps {
  media: MediaFile[];
  platforms: Platform[];
  onAutoConvert?: (media: MediaFile, platform: Platform) => void;
  onSkipPlatform?: (platform: Platform) => void;
}

interface MediaFile {
  id: string;
  url: string;
  type: 'image' | 'video' | 'gif';
  width: number;
  height: number;
  duration?: number; // seconds, for video
  size: number; // bytes
  format: string;
}

interface CompatibilityResult {
  platform: Platform;
  status: 'pass' | 'warning' | 'fail';
  issues: CompatibilityIssue[];
  suggestions: string[];
}
```

---

## 8. Accessibility Considerations

### 8.1 Keyboard Navigation

```
Social Media Hub Keyboard Shortcuts:

GLOBAL
| Shortcut      | Action                          |
|---------------|--------------------------------|
| Ctrl+N        | New post                       |
| Ctrl+K        | Command palette                |
| Ctrl+/        | Show shortcuts help            |
| Esc           | Close modal/cancel action      |

CALENDAR
| Shortcut      | Action                          |
|---------------|--------------------------------|
| Arrow Keys    | Navigate dates                 |
| Enter         | Open selected date/post        |
| Ctrl+Arrow    | Jump week (in month view)      |
| M/W/D/Q       | Switch view (Month/Week/Day/Queue) |

COMPOSER
| Shortcut      | Action                          |
|---------------|--------------------------------|
| Ctrl+Enter    | Submit/Schedule                |
| Ctrl+S        | Save draft                     |
| Ctrl+P        | Preview                        |
| Tab           | Accept AI suggestion           |
| Ctrl+1-9      | Toggle platform selection      |
```

### 8.2 Screen Reader Support

```html
<!-- Platform selector with proper ARIA -->
<div role="group" aria-label="Select platforms to post to">
  <button
    role="checkbox"
    aria-checked="true"
    aria-label="Twitter/X - connected as @company_handle"
  >
    <span aria-hidden="true">[X Logo]</span>
    Twitter/X
  </button>
</div>

<!-- Character counter announcement -->
<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
>
  142 of 280 characters used for Twitter
</div>

<!-- Approval status -->
<div
  role="alert"
  aria-live="assertive"
>
  Post requires approval. Submitted for review.
</div>

<!-- Calendar navigation -->
<div
  role="grid"
  aria-label="Content calendar for February 2026"
>
  <div role="row">
    <div
      role="gridcell"
      aria-label="February 14, 3 posts scheduled"
      tabindex="0"
    >
      14
    </div>
  </div>
</div>
```

### 8.3 Color Contrast Requirements

```css
/* Ensure platform colors meet WCAG AA contrast */
.platform-badge {
  /* Light mode */
  --twitter-bg: #E8E8E8;
  --twitter-text: #000000; /* 21:1 contrast */

  --facebook-bg: #E7F0FA;
  --facebook-text: #1877F2; /* 4.5:1 contrast */

  --instagram-bg: #FCE8EC;
  --instagram-text: #C13584; /* 4.5:1 contrast */
}

/* High contrast mode overrides */
@media (prefers-contrast: high) {
  .platform-badge {
    --twitter-bg: #000000;
    --twitter-text: #FFFFFF;

    --facebook-bg: #1877F2;
    --facebook-text: #FFFFFF;

    --instagram-bg: #E4405F;
    --instagram-text: #FFFFFF;
  }
}
```

### 8.4 Focus Management

```typescript
// Modal focus trap for post composer
function PostComposerModal({ isOpen, onClose }) {
  const firstFocusRef = useRef<HTMLElement>(null);
  const lastFocusRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isOpen && firstFocusRef.current) {
      firstFocusRef.current.focus();
    }
  }, [isOpen]);

  // Tab trap logic
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === firstFocusRef.current) {
        e.preventDefault();
        lastFocusRef.current?.focus();
      } else if (!e.shiftKey && document.activeElement === lastFocusRef.current) {
        e.preventDefault();
        firstFocusRef.current?.focus();
      }
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div role="dialog" aria-modal="true" onKeyDown={handleKeyDown}>
      {/* Modal content */}
    </div>
  );
}
```

### 8.5 Reduced Motion Support

```css
@media (prefers-reduced-motion: reduce) {
  /* Disable calendar drag animations */
  .calendar-post-drag {
    transition: none;
  }

  /* Disable chart animations */
  .analytics-chart {
    animation: none;
  }

  /* Simple opacity for loading states */
  .skeleton-loading {
    animation: none;
    opacity: 0.6;
  }

  /* Instant state changes */
  .platform-selector-item {
    transition: none;
  }
}
```

---

## Appendix A: Platform API Limitations

| Platform | API Rate Limits | Posting Limits | Media Limits |
|----------|-----------------|----------------|--------------|
| Twitter/X | 300 posts/3hr | 2400/day | 4 images or 1 video |
| Facebook | 200 posts/hr | Varies by Page | 10 images or 1 video |
| Instagram | 25 actions/hr | 25 posts/day | 10 carousel, 1 video |
| LinkedIn | 100 posts/day | 100/day | 9 images or 1 video |
| TikTok | 5000 videos/day | -- | 1 video per post |
| YouTube | 6 uploads/24hr | Varies | 1 video per post |
| Pinterest | 100 pins/hr | 200/day | 5 images per Pin |
| Threads | -- | -- | 10 images or 1 video |
| Mastodon | Instance varies | Instance varies | Instance varies |

---

## Appendix B: Design Token Reference

```css
/* Social Media specific tokens */
:root {
  /* Platform colors - see section 4.3 */

  /* Calendar specific */
  --calendar-cell-size: 120px;
  --calendar-post-height: 24px;
  --calendar-gap: 4px;

  /* Analytics charts */
  --chart-grid-color: var(--border-subtle);
  --chart-line-width: 2px;
  --chart-point-size: 6px;

  /* Composer */
  --composer-max-width: 800px;
  --preview-panel-width: 400px;
  --character-bar-height: 4px;

  /* Approval badges */
  --approval-pending: var(--color-warning);
  --approval-approved: var(--color-success);
  --approval-rejected: var(--color-error);
  --approval-changes: var(--color-info);
}
```

---

*Document Version: 1.0*
*Last Updated: February 2026*
*Author: UX Design Expert Agent*

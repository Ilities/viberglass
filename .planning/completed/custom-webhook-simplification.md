# Custom Webhook Integration Simplification

**Date:** 2026-02-11
**Status:** Completed

## Problem

The Custom Webhook integration required users to fill out a Configuration form (API Key, Source Name) before they could create webhook endpoints. This added unnecessary friction since:

1. Custom webhooks don't need authentication configuration - they use per-endpoint secrets
2. The "Source Name" field provided no functional value
3. Users had to complete two steps (configure integration, then create webhooks) instead of one

## Solution

Simplified the Custom Webhook flow to:

1. **Auto-create integration** when user navigates to Custom Webhook page
2. **Skip Configuration section** entirely for custom integrations
3. **Allow project linking** at the individual webhook level (not integration level)

## Changes Made

### Backend
- Removed `authTypes` and `configFields` from custom plugin definition

### Frontend
- Auto-create Custom Webhook integration with timestamp-based name on page load
- Hide Configuration section for custom integrations
- Show webhook sections immediately without requiring "configured" status
- Added project selection dropdown to both inbound and outbound webhook sections
- Projects are loaded when viewing a custom integration
- Project selection is tracked per webhook endpoint and saved to backend

## Result

Users can now:
1. Click "Custom Webhook" from integrations list
2. Immediately see webhook management UI (no configuration step)
3. Create multiple webhook endpoints
4. Link each endpoint to a specific project or keep it global

The backend already supported `project_id` on webhook configs - this change exposes that capability in the UI.

# Express to Next.js Migration Checklist

## 1. Project Setup
- [ ] Create Next.js project parallel to current Express project
  ```bash
  npx create-next-app@latest linkedin-tracker-next --typescript --tailwind --eslint
  ```

- [ ] Set up project structure mirroring current architecture:
  ```
  linkedin-tracker-next/
  ├── src/
  │   ├── app/
  │   │   ├── page.tsx                  # Replaces views/index.ejs
  │   │   ├── auth/gmail/route.ts       # Replaces /auth/gmail endpoint
  │   │   ├── oauth2callback/route.ts   # Replaces /oauth2callback endpoint
  │   │   ├── api/
  │   │   │   ├── fetch-metadata/route.ts
  │   │   │   ├── fetch-emails/route.ts
  │   │   │   └── generate-chart/route.ts
  │   ├── components/
  │   │   ├── AuthSection.tsx
  │   │   ├── EmailFetchSection.tsx
  │   │   ├── ApplicationTrackingSection.tsx
  │   │   └── ProgressBar.tsx
  │   ├── lib/
  │   │   ├── auth/
  │   │   │   └── gmailAuthService.ts   # Refactor from services/gmailAuthService.js
  │   │   ├── gmail/
  │   │   │   ├── fetchMetadataService.ts
  │   │   │   └── gmailFetchService.ts
  │   │   └── utils/
  │   │       └── applicationTrackingService.ts
  │   └── types/
  │       ├── gmail.ts
  │       └── application.ts
  ├── public/
  │   └── images/
  │       └── email.png                 # Copy from current public/images/
  ```

## 2. File Migration Mapping
### Views to React Components
- [ ] Convert `source/views/index.ejs` to:
  ```
  src/app/page.tsx                    # Main page container
  src/components/AuthSection.tsx      # Gmail authentication section
  src/components/EmailFetchSection.tsx # Email fetching section
  src/components/ApplicationTrackingSection.tsx # Chart section
  ```

### Services to TypeScript
- [ ] Convert `source/services/gmailAuthService.js` to:
  ```typescript:src/lib/auth/gmailAuthService.ts
  interface GmailAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }
  
  class GmailAuthService {
    // Type-safe implementation
  }
  ```

- [ ] Convert `source/services/gmailFetchService.js` to:
  ```typescript:src/lib/gmail/gmailFetchService.ts
  interface EmailFetchOptions {
    amount: number | 'all';
    userId: string;
  }
  ```

- [ ] Convert `source/services/applicationTrackingService.js` to:
  ```typescript:src/lib/utils/applicationTrackingService.ts
  interface ApplicationData {
    date: string;
    count: number;
  }
  ```

## 3. API Route Migration
- [ ] Create Next.js API routes:
  ```typescript:src/app/api/fetch-emails/route.ts
  import { NextResponse } from 'next/server';
  import { GmailFetchService } from '@/lib/gmail/gmailFetchService';
  
  export async function GET(request: Request) {
    // Implementation
  }
  ```

  ```typescript:src/app/api/generate-chart/route.ts
  import { NextResponse } from 'next/server';
  import { ApplicationTrackingService } from '@/lib/utils/applicationTrackingService';
  
  export async function POST(request: Request) {
    // Implementation
  }
  ```

## 4. Environment Setup
- [ ] Create environment files:
  ```plaintext:.env.local
  NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id
  GOOGLE_CLIENT_SECRET=your_client_secret
  ENCRYPTION_KEY=your_encryption_key
  ```

## 5. Authentication Implementation
- [ ] Install NextAuth.js:
  ```bash
  npm install next-auth
  ```

- [ ] Create auth configuration:
  ```typescript:src/app/api/auth/[...nextauth]/route.ts
  import NextAuth from 'next-auth';
  import GoogleProvider from 'next-auth/providers/google';
  ```

## 6. Database Migration
- [ ] Create Prisma schema:
  ```prisma:prisma/schema.prisma
  model User {
    id            String   @id @default(cuid())
    email         String   @unique
    accessToken   String?
    refreshToken  String?
    emailMetadata EmailMetadata[]
  }

  model EmailMetadata {
    id            String   @id @default(cuid())
    userId        String
    lastFetchTime DateTime
    emailsFetched Int
    user          User     @relation(fields: [userId], references: [id])
  }
  ```

## 7. Component Implementation
- [ ] Create base components:
  ```typescript:src/components/AuthSection.tsx
  export default function AuthSection({
    isAuthenticated,
    onAuth
  }: {
    isAuthenticated: boolean;
    onAuth: () => void;
  }) {
    // Implementation
  }
  ```

## 8. Testing Setup
- [ ] Create test files:
  ```typescript:src/lib/auth/__tests__/gmailAuthService.test.ts
  import { GmailAuthService } from '../gmailAuthService';
  
  describe('GmailAuthService', () => {
    // Tests
  });
  ```

## 9. Parallel Running Configuration
- [ ] Configure ports:
  ```typescript:next.config.js
  /** @type {import('next').NextConfig} */
  const nextConfig = {
    // Configuration
  }
  ```

## 10. Deployment Setup
- [ ] Create Vercel configuration:
  ```json:vercel.json
  {
    "version": 2,
    "builds": [
      {
        "src": "source/app.js",
        "use": "@vercel/node"
      }
    ],
    "routes": [
      {
        "src": "/favicon.ico",
        "dest": "/source/app.js"
      },
      {
        "src": "/static/(.*)",
        "dest": "/source/public/$1"
      },
      {
        "src": "/_health",
        "dest": "/source/app.js"
      },
      {
        "src": "/api/(.*)",
        "dest": "/source/app.js"
      },
      {
        "src": "/(.*)",
        "dest": "/source/app.js"
      }
    ]
  }
  ```

## 11. Express Removal Phase
### Routes to Remove:
- [ ] `/auth/gmail` -> replaced by Next.js route
- [ ] `/oauth2callback` -> replaced by NextAuth callback
- [ ] `/fetch-metadata` -> replaced by API route
- [ ] `/fetch_emails` -> replaced by API route
- [ ] `/generate-application-chart` -> replaced by API route

### Files to Remove:
- [ ] `source/app.js`
- [ ] `source/views/index.ejs`
- [ ] `source/services/gmailAuthService.js`
- [ ] `source/services/gmailFetchService.js`
- [ ] `source/services/applicationTrackingService.js`
- [ ] `source/services/fetchMetadataService.js`

## 12. Final Verification
- [ ] Test all migrated features:
  - [ ] Gmail authentication flow
  - [ ] Email fetching with progress
  - [ ] Chart generation
  - [ ] Data persistence

- [ ] Verify server entry point location:
  - Ensure main server file exists at source/app.js with:
    - Proper Express initialization
    - Error handling middleware
    - Proper module exports
  - Verify vercel.json configuration:
    - Correct src path in builds: "source/app.js"
    - Route handling for static files: "/static/(.*)"
    - Route handling for API endpoints: "/api/(.*)"
    - Default route handling: "/(.*)"
  - Make sure the file is not listed in .vercelignore
  - Test local deployment with `vercel dev`
  - Check server logs for connection errors

- [ ] Verify static file handling:
  - Remove serve-favicon middleware
  - Add direct route handler for favicon.ico
  - Verify static file paths:
    - /favicon.ico -> public/images/email.png
    - /static/* -> public/*
  - Test static file access in development and production
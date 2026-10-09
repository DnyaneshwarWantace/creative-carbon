import { Migration } from '@mikro-orm/migrations';

export class Migration20261009132524_cc_accounts extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_tally_jobs" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "purpose" text not null, "request_xml" text not null, "status" text not null, "response_text" text null, "http_status" int null, "error" text null, "taken_at" timestamptz null, "done_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_tally_jobs_queue_idx" on "cc_tally_jobs" ("organization_id", "tenant_id", "status", "created_at");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_tally_jobs";`);
  }

}

import { Migration } from '@mikro-orm/migrations';

export class Migration20261010084349_cc_audit extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_activity_log" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "record_type" text not null, "record_id" text not null, "action" text not null, "kind" text not null default 'change', "summary" text null, "reason" text null, "changes" jsonb null, "links" jsonb null, "source" text not null default 'screen', "actor_user_id" uuid null, "actor_name" text null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_activity_log_actor_idx" on "cc_activity_log" ("organization_id", "tenant_id", "actor_user_id", "created_at");`);
    this.addSql(`create index "cc_activity_log_record_idx" on "cc_activity_log" ("organization_id", "tenant_id", "record_type", "record_id", "created_at");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_activity_log";`);
  }

}

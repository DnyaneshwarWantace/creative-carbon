import { Migration } from '@mikro-orm/migrations';

export class Migration20260927052431_dermat_orders extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "dermat_stage_settings" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "stage_key" text not null, "label" text null, "day_limit" int null, "hidden_steps" jsonb null, "required_fields" jsonb null, "extra_fields" jsonb null, "documents" jsonb null, "extra_documents" jsonb null, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "dermat_stage_settings" add constraint "dermat_stage_settings_scope_uq" unique ("organization_id", "tenant_id", "stage_key");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dermat_stage_settings" cascade;`);
  }

}

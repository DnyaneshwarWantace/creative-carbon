import { Migration } from '@mikro-orm/migrations';

export class Migration20261006120000_dermat_rnd_lab extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "dermat_rnd_requests" add column "client_instruction" text null, add column "texture_reference" text null, add column "target_ph" text null, add column "claims" text null, add column "sample_qty" text null, add column "ingredient_refs" jsonb null, add column "approved_trial_id" uuid null, add column "bom_id" uuid null, add column "bom_product_id" uuid null;`);
    this.addSql(`create table "dermat_rnd_trials" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "request_id" uuid not null, "code" text not null, "trial_no" int not null, "status" text not null default 'draft', "batch_date" text null, "chemist_name" text null, "batch_size" numeric(14,3) null, "batch_unit" text not null default 'g', "aim" text null, "procedure" text null, "formula" jsonb null, "observations" jsonb null, "stability" jsonb null, "stability_status" text not null default 'not_started', "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_rnd_trials_request_idx" on "dermat_rnd_trials" ("organization_id", "tenant_id", "request_id");`);
    this.addSql(`alter table "dermat_rnd_trials" add constraint "dermat_rnd_trials_code_uq" unique ("organization_id", "tenant_id", "code");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dermat_rnd_trials" cascade;`);
    this.addSql(`alter table "dermat_rnd_requests" drop column if exists "client_instruction", drop column if exists "texture_reference", drop column if exists "target_ph", drop column if exists "claims", drop column if exists "sample_qty", drop column if exists "ingredient_refs", drop column if exists "approved_trial_id", drop column if exists "bom_id", drop column if exists "bom_product_id";`);
  }

}

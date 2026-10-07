import { Migration } from '@mikro-orm/migrations';

export class Migration20261007174012_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_upload_batches" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "register_key" text not null, "file_name" text not null, "file_hash" text not null, "register_date" text null, "total_rows" int not null, "created_rows" int not null, "updated_rows" int not null, "failed_rows" int not null, "errors" jsonb null, "by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_upload_batches_scope_idx" on "cc_upload_batches" ("organization_id", "tenant_id", "register_key");`);
  }

}

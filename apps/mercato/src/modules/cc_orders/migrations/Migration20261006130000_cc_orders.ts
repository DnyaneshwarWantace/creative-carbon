import { Migration } from '@mikro-orm/migrations';

export class Migration20261006130000_cc_orders extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_stage_settings" add column if not exists "shared_fields" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_stage_settings" drop column if exists "shared_fields";`);
  }

}

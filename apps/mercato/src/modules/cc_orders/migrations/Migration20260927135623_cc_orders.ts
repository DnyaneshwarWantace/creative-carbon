import { Migration } from '@mikro-orm/migrations';

export class Migration20260927135623_cc_orders extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_stage_settings" add "reopen_hours" int null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_stage_settings" drop column "reopen_hours";`);
  }

}

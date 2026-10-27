import { Migration } from '@mikro-orm/migrations';

export class Migration20261027070158_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_moulds" add "cavities" int null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_moulds" drop column "cavities";`);
  }

}

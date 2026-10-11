import { Migration } from '@mikro-orm/migrations';

export class Migration20261011082707_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_production_plans" add "versions" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_production_plans" drop column "versions";`);
  }

}

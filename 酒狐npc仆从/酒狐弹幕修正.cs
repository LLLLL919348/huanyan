using System;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>
/// 酒狐发射弹幕的导航修正：
/// 很多武器（如烈焰神灯、终极棱镜）的弹幕会朝“玩家鼠标”方向飞，导致酒狐用它们时
/// 弹道总是水平朝右乱飞。这里把酒狐发射的远程/法术弹幕柔和地转向酒狐的当前攻击目标。
/// </summary>
public sealed class 酒狐弹幕修正 : GlobalProjectile
{
    public override bool PreAI(Projectile projectile)
    {
        // 只处理酒狐发射的弹幕
        if (!酒狐攻击.FoxProjectiles.Contains(projectile.whoAmI))
            return true;

        Player owner = projectile.owner >= 0 && projectile.owner < Main.maxPlayers ? Main.player[projectile.owner] : null;
        if (owner == null) return true;

        //====统一：酒狐弹幕的敌人 = 酒狐当前敌人====
        //练功挑衅：酒狐把主人当敌人 → 所有酒狐弹幕都打主人（hostile=friendly=false 面向玩家）
        if (酒狐任务执行.恋还是练激活(owner) && 酒狐任务执行.挑衅激活(owner))
        {
            projectile.friendly = false;
            projectile.hostile = true;   //能命中玩家
            //朝主人转向
            if (projectile.velocity != Vector2.Zero)
            {
                Vector2 desired = owner.Center - projectile.Center;
                if (desired != Vector2.Zero)
                {
                    float speed = projectile.velocity.Length();
                    desired.Normalize();
                    desired *= Math.Max(speed, 12f);
                    projectile.velocity = Vector2.Lerp(projectile.velocity, desired, 0.22f);
                }
            }
            return true;
        }

        //主动防御：酒狐弹幕可穿墙（寻敌已可穿墙）
        if (酒狐任务执行.主动防御激活(owner))
            projectile.tileCollide = false;
        if (酒狐攻击.CurrentTargetIndex < 0 || 酒狐攻击.CurrentTargetIndex >= Main.maxNPCs)
            return true;
        NPC target = Main.npc[酒狐攻击.CurrentTargetIndex];
        if (!target.active || target.life <= 0)
            return true;

        // 只修正 远程/法术 弹幕，避免干扰近战挥砍/召唤物
        DamageClass dt = projectile.DamageType;
        if (dt != DamageClass.Ranged && dt != DamageClass.Magic)
            return true;
        if (projectile.velocity == Vector2.Zero)
            return true;

        Vector2 desired2 = target.Center - projectile.Center;
        if (desired2 == Vector2.Zero)
            return true;
        float speed2 = projectile.velocity.Length();
        if (speed2 <= 0f)
            return true;
        desired2.Normalize();
        desired2 *= speed2;

        // 柔和转向目标（每tick一点点，弹道自然弯曲而非瞬移）
        projectile.velocity = Vector2.Lerp(projectile.velocity, desired2, 0.18f);
        return true;
    }

    public override void OnKill(Projectile projectile, int damage)
    {
        酒狐攻击.FoxProjectiles.Remove(projectile.whoAmI);
        梦水晶攻击.梦云弹.Remove(projectile.whoAmI);
    }

    //====梦云水晶弹幕命中：无视目标防御 + 附带目标最大生命x5%伤害====
    public override void ModifyHitNPC(Projectile projectile, NPC target, ref NPC.HitModifiers modifiers)
    {
        if (!梦水晶攻击.梦云弹.Contains(projectile.whoAmI)) return;
        Player owner = projectile.owner >= 0 && projectile.owner < Main.maxPlayers ? Main.player[projectile.owner] : null;
        if (owner == null || !owner.GetModPlayer<酒狐玩家>().HasDreamCrystalEquipped()) return;
        //无视防御：把穿透设为最大，等效忽略目标防御
        projectile.ArmorPenetration = int.MaxValue;
    }

    public override void OnHitNPC(Projectile projectile, NPC target, NPC.HitInfo hit, int damageDone)
    {
        if (!梦水晶攻击.梦云弹.Contains(projectile.whoAmI)) return;
        Player owner = projectile.owner >= 0 && projectile.owner < Main.maxPlayers ? Main.player[projectile.owner] : null;
        if (owner == null || !owner.GetModPlayer<酒狐玩家>().HasDreamCrystalEquipped()) return;
        if (target == null || !target.active || target.dontTakeDamage) return;
        //附带目标最大生命x5%的额外伤害（作为一次独立打击，避免与主伤害重复计算）
        int bonus = (int)(target.lifeMax * 0.05f);
        if (bonus > 0)
            target.SimpleStrikeNPC(bonus, projectile.direction, false, 0f, DamageClass.Magic);
    }
}

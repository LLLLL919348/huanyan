using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>梦云水晶变身：以酒狐为中心，周期性地用多种弹幕方式攻击目标（环形环绕、流星雨、追踪扇射、电光爆发），高频率高伤害。</summary>
internal static class 梦水晶攻击
{
    // 当酒狐佩戴梦云水晶时，由本体命中/弹幕命中附加“目标最大生命x5%”伤害并忽略防御（见 酒狐饰品/酒狐弹幕修正）
    internal static readonly HashSet<int> 梦云弹 = new HashSet<int>();   //梦云水晶专属弹幕的 projectile 索引

    private static int timer;
    private static int 招式序号;   //0=扇形 1=环形 2=流星雨 3=电光爆发，轮流切换

    private static readonly int[] 弹幕池 = { ProjectileID.Spark, ProjectileID.CrystalShard, ProjectileID.MagicMissile, ProjectileID.ShadowBeamFriendly };

    public static void Update(NPC fox, Terraria.Player owner)
    {
        NPC target = 酒狐攻击.FindTarget(fox, owner);
        if (target == null) return;
        if (--timer > 0) return;
        timer = 14;   //约每0.23秒一轮

        int baseDmg = 酒狐饰品.攻击伤害(owner, owner.GetModPlayer<酒狐玩家>().当前武器.IsAir ? 12 : owner.GetWeaponDamage(owner.GetModPlayer<酒狐玩家>().当前武器));
        int 招式 = 招式序号 % 4;
        招式序号++;

        switch (招式)
        {
            case 0:  //扇形（追踪扇射）
                for (int i = 0; i < 3; i++)
                {
                    int type = 弹幕池[Main.rand.Next(弹幕池.Length)];
                    int dmg = (int)(baseDmg * 3.5f) + 450;
                    发射(fox, owner, target, type, dmg, 扇形速度(target, i, 3), fox.Center + new Vector2(0f, -8f), 11f);
                }
                break;
            case 1:  //环形环绕：围绕目标一圈发射
                for (int i = 0; i < 8; i++)
                {
                    float ang = (float)(i / 8f * Math.PI * 2f + Main.GameUpdateCount * 0.01f);
                    int type = 弹幕池[Main.rand.Next(弹幕池.Length)];
                    int dmg = (int)(baseDmg * 3.2f) + 400;
                    Vector2 origin = target.Center + new Vector2((float)Math.Cos(ang) * 140f, (float)Math.Sin(ang) * 140f);
                    Vector2 vel = target.Center - origin;
                    发射(fox, owner, target, type, dmg, vel, origin, 12f);
                }
                break;
            case 2:  //流星雨：从目标上方落下大量
                int stars = Main.rand.Next(4, 7);
                for (int i = 0; i < stars; i++)
                {
                    int type = ProjectileID.FallingStar;
                    int dmg = (int)(baseDmg * 2.6f) + 350;
                    Vector2 origin = target.Center + new Vector2(Main.rand.NextFloat(-180f, 180f), -360f - Main.rand.NextFloat(0f, 120f));
                    Vector2 vel = target.Center + new Vector2(Main.rand.NextFloat(-30f, 30f), Main.rand.NextFloat(0f, 20f)) - origin;
                    发射(fox, owner, target, type, dmg, vel, origin, 12f);
                }
                break;
            default:  //电光爆发：中心多向散射
                for (int i = 0; i < 6; i++)
                {
                    float ang = (float)(i / 6f * Math.PI * 2f);
                    int type = ProjectileID.Spark;
                    int dmg = (int)(baseDmg * 3.8f) + 500;
                    Vector2 vel = new Vector2((float)Math.Cos(ang), (float)Math.Sin(ang));
                    发射(fox, owner, target, type, dmg, vel, fox.Center + new Vector2(0f, -8f), 10f);
                }
                break;
        }
    }

    //恋还是练挑衅：梦云水晶弹幕转打玩家（酒狐本体直接命中玩家）
    public static void Update打玩家(NPC fox, Terraria.Player owner)
    {
        if (--timer > 0) return;
        timer = 18;

        int dmg = (int)(酒狐饰品.攻击伤害(owner, owner.GetModPlayer<酒狐玩家>().当前武器.IsAir ? 12 : owner.GetWeaponDamage(owner.GetModPlayer<酒狐玩家>().当前武器)) * 3.0f) + 400;
        Vector2 origin = fox.Center + new Vector2(0f, -8f);
        Vector2 vel = owner.Center - origin;
        if (vel == Vector2.Zero) return;
        vel.Normalize();
        vel *= 12f;
        int proj = Projectile.NewProjectile(fox.GetSource_FromAI(), origin, vel, ProjectileID.Spark, dmg, 4f, owner.whoAmI);
        if (proj >= 0 && proj < Main.maxProjectiles)
        {
            Main.projectile[proj].hostile = true;
            Main.projectile[proj].friendly = false;
            Main.projectile[proj].damage = dmg;
            梦云弹.Add(proj);
        }
    }

    private static Vector2 扇形速度(NPC target, int i, int count)
    {
        Vector2 vel = target.Center - (target.Center + new Vector2(0f, -8f));
        if (vel == Vector2.Zero) return Vector2.UnitX;
        vel.Normalize();
        float spread = (i - (count - 1) / 2f) * 0.08f;
        return Vector2.Transform(vel, Matrix.CreateRotationZ(spread));
    }

    private static void 发射(NPC fox, Terraria.Player owner, NPC target, int type, int dmg, Vector2 vel, Vector2 origin, float speed)
    {
        if (vel == Vector2.Zero) return;
        vel.Normalize();
        vel *= speed;
        int proj = Projectile.NewProjectile(fox.GetSource_FromAI(), origin, vel, type, dmg, 4f, owner.whoAmI);
        if (proj >= 0 && proj < Main.maxProjectiles)
        {
            梦云弹.Add(proj);
            酒狐攻击.FoxProjectiles.Add(proj);
        }
    }
}

using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Terraria;
using Terraria.Audio;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>
/// 酒狐扔向玩家的蛋糕：美味治愈弹幕。
/// 玩家受伤(未满血)时，酒狐每隔一段时间朝玩家抛出；蛋糕旋转飞行、可穿墙，
/// 命中玩家、或抵达玩家周围后“啪叽”碎掉，给玩家恢复（20 + 最大生命5%），并播放恢复音效与回血飘字。
/// </summary>
public sealed class 蛋糕弹 : ModProjectile
{
    public override string Texture => "酒狐npc仆从/饰品/cake";

    public override void SetDefaults()
    {
        Projectile.width = 30;
        Projectile.height = 30;
        Projectile.friendly = true;
        Projectile.hostile = false;
        Projectile.tileCollide = false;       //可穿墙
        Projectile.ignoreWater = true;
        Projectile.penetrate = -1;            //不因命中而消失
        Projectile.timeLeft = 180;            //约3秒
        Projectile.scale = 1.3f;   //蛋糕贴图放大一点
        Projectile.aiStyle = -1;
        Projectile.DamageType = DamageClass.Magic;   //弹幕类型
        Projectile.alpha = 0;
    }

    public override void AI()
    {
        //旋转 + 朝目标玩家柔和平抛
        Projectile.rotation += 0.15f;

        Player owner = Projectile.owner >= 0 && Projectile.owner < Main.maxPlayers ? Main.player[Projectile.owner] : null;
        if (owner == null) return;

        //冲向玩家：不用硬追踪，用柔和矢量逼近，比较自然（命中或足够近后落地）
        Vector2 toPlayer = owner.Center - Projectile.Center;
        float speed = Projectile.velocity.Length();
        if (toPlayer != Vector2.Zero)
        {
            toPlayer.Normalize();
            toPlayer *= speed;
            Projectile.velocity = Vector2.Lerp(Projectile.velocity, toPlayer, 0.12f);
        }

        //旋转粒子
        if (Main.rand.NextBool(3))
        {
            Dust d = Dust.NewDustPerfect(Projectile.Center, DustID.Silver, Main.rand.NextVector2Circular(-1f, -1f), 0, new Color(255, 220, 200), 0.8f);
            d.noGravity = true;
        }

        //抵达玩家周围(约24px) → 直接生效
        if (Vector2.Distance(Projectile.Center, owner.Center) < 30f)
        {
            对玩家生效(owner);
            Projectile.Kill();
            return;
        }

        //存留超时 → 也生效（未接住也算送到）
        if (Projectile.timeLeft <= 1)
            对玩家生效(owner);
    }

    public override void OnHitPlayer(Player target, Player.HurtInfo info)
    {
        //命中玩家（本弹幕 friendly，用 OnHitPlayer 触发治疗）
        if (target != null)
            对玩家生效(target);
        Projectile.Kill();
    }

    private void 对玩家生效(Player player)
    {
        //默认：20 + 玩家最大生命1%；酒狐佩戴芳心织囊后提升为：30 + 最大生命5%
        int heal = 20 + (int)(player.statLifeMax2 * 0.01f);
        NPC fox = 酒狐饰品.找酒狐(player);
        if (fox != null && 酒狐饰品.酒狐佩戴(player, ModContent.ItemType<芳心织囊>()))
            heal = 30 + (int)(player.statLifeMax2 * 0.05f);
        if (heal <= 0) heal = 20;
        player.statLife += heal;
        if (player.statLife > player.statLifeMax2) player.statLife = player.statLifeMax2;

        if (!Main.dedServ)
        {
            //恢复音效
            SoundEngine.PlaySound(SoundID.Item3, player.Center);
            //回血飘字
            CombatText.NewText(player.Hitbox, new Color(120, 255, 140), $"+{heal}", true);
            //蛋糕碎屑
            for (int i = 0; i < 14; i++)
            {
                Dust d = Dust.NewDustPerfect(Projectile.Center, DustID.Silver,
                    Main.rand.NextVector2Circular(-4f, -3f), 0, new Color(255, 240, 230), 1.1f);
                d.noGravity = true;
            }
        }
    }

    public override bool PreDraw(ref Color lightColor)
    {
        //本体贴图随旋转绘制（固定显示为 30x30）
        Texture2D tex = Terraria.GameContent.TextureAssets.Projectile[Projectile.type].Value;
        if (tex == null) return false;
        Rectangle src = new(0, 0, tex.Width, tex.Height);
        const float 显示尺寸 = 30f;
        Main.spriteBatch.Draw(
            tex,
            Projectile.Center - Main.screenPosition,
            src, Color.White, Projectile.rotation,
            new Vector2(tex.Width / 2f, tex.Height / 2f),
            new Vector2(显示尺寸 / tex.Width, 显示尺寸 / tex.Height),   //按比例缩放到 30x30
            SpriteEffects.None, 0f);
        return false;
    }
}

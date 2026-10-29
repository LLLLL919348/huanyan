using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>
/// 烬华之戒（spring-ring）——佩戴者每降低2%的最大生命值，提高0.5%的攻击力。
/// 玩家：额外+5防御力，受击后有短暂无敌时间；酒狐：额外+15防御力。
/// 获取：击败克苏鲁之眼15%掉落，或用 红宝石x1+银锭x3+灰烬块x10 在工作台合成。玩家与酒狐都可佩戴。
/// </summary>
public sealed class 烬华之戒 : ModItem
{
    public override string Texture => "酒狐npc仆从/饰品/spring_ring_big";

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.Lime;
        Item.value = Item.buyPrice(gold: 5);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(ItemID.Ruby, 1)
            .AddIngredient(ItemID.SilverBar, 3)
            .AddIngredient(ItemID.AshBlock, 10)
            .AddTile(TileID.WorkBenches)
            .Register();
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(255, 170, 90);
                break;
            }
        }
    }

    //===== 效果（在 酒狐饰品 / 酒狐玩家 里生效）=====

    // 每降低2%最大生命 → 攻击力+0.5%。healthRatio = 当前血量/最大血量。
    public static float 攻击加成(float healthRatio)
    {
        float lostPercent = (1f - MathHelper.Clamp(healthRatio, 0f, 1f)) * 100f;
        return 1f + (lostPercent / 2f) * 0.005f;
    }
}

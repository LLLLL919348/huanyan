using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>
/// 紫荆冠刺（sliver-cercis）——佩戴者：
///   攻击使目标防御力暂时降低 目标最大防御x25% + 20 点；
///   受到的伤害全额返还给伤害者；
///   防御力+15；
///   受到的近战伤害降低20%。
/// 获取：击杀尖刺史莱姆5%掉落，或用 尖刺x10+银锭x3+紫水晶x1 在工匠作坊合成。玩家与酒狐都可佩戴。
/// </summary>
public sealed class 紫荆冠刺 : ModItem
{
    public override string Texture => "酒狐npc仆从/饰品/sliver_cercis_big";

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.LightPurple;
        Item.value = Item.buyPrice(gold: 6);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(ItemID.Spike, 10)      //尖刺x10
            .AddIngredient(ItemID.SilverBar, 3)   //银锭x3
            .AddIngredient(ItemID.Amethyst, 1)    //紫水晶x1
            .AddIngredient(ItemID.Ichor, 3)       //灵液x3
            .AddTile(TileID.TinkerersWorkbench)    //工匠作坊
            .Register();
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(190, 140, 255);
                break;
            }
        }
    }

    //===== 效果常量（供 酒狐饰品 / 酒狐玩家 调用）=====

    // 减防：目标最大防御x25% + 20 点
    public static int 减防值(int targetDefense) => (int)(targetDefense * 0.25f) + 20;
}

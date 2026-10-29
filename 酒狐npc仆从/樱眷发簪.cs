using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>樱眷发簪——仅酒狐可佩戴，使来袭伤害减免20%，每级好感度+20%（最大60%）
/// 并持续给予酒狐抗火/免疫中毒/生命恢复/铁皮/免疫岩浆等增益。</summary>
public sealed class 樱眷发簪 : ModItem
{
    public override string Texture => "酒狐npc仆从/饰品/hairpin_big";

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.LightRed;
        Item.value = Item.buyPrice(gold: 10);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(ItemID.VanityTreeSakuraSeed, 1)         //樱花树苗x1
            .AddIngredient(ModContent.ItemType<芳心织囊>(), 1)    //芳心织囊x1
            .AddIngredient(ModContent.ItemType<不死图腾>(), 1)    //不死图腾x1
            .AddIngredient(ItemID.HallowedBar, 5)                 //神圣锭x5
            .AddTile(TileID.TinkerersWorkbench)                   //工匠作坊
            .Register();
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(255, 170, 200);
                break;
            }
        }
    }
}

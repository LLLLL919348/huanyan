using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>救赎之戒——酒狐：最大生命+50%、持续生命恢复；玩家：受到任意来源伤害降为75%、造成伤害+20%、持续生命恢复。</summary>
public sealed class 救赎之戒 : ModItem
{
    public override string Texture => "酒狐npc仆从/饰品/redemption_ring_big";

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.Orange;
        Item.value = Item.buyPrice(gold: 8);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    public override void AddRecipes()
    {
        //秘银砧/山铜砧（原版二者为同一砧位，用谜银砧即可）
        CreateRecipe()
            .AddIngredient(ItemID.HallowedBar, 10)
            .AddIngredient(ItemID.SoulofMight, 5)
            .AddIngredient(ItemID.SoulofSight, 5)
            .AddIngredient(ItemID.SoulofFright, 5)
            .AddTile(TileID.MythrilAnvil)
            .Register();
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(255, 190, 90);
                break;
            }
        }
    }
}

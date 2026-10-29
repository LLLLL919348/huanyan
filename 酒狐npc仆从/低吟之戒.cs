using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>低吟之戒——使酒狐攻击频率加快20%、所有伤害+20%。</summary>
public sealed class 低吟之戒 : ModItem
{
    public override string Texture => "酒狐npc仆从/饰品/quick_chant_ring_big";

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.Lime;
        Item.value = Item.buyPrice(gold: 6);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(150, 230, 150);
                break;
            }
        }
    }
}

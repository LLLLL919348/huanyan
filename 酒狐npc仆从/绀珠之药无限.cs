using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>绀珠之药（无限~）——可无限次触发的酒狐护身效果。</summary>
public sealed class 绀珠之药无限 : ModItem
{
    public override string Texture => "酒狐npc仆从/饰品/ultramarine_orb_elixir_big";

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.Purple;
        Item.value = Item.buyPrice(gold: 12);
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
                line.OverrideColor = new Color(150, 200, 255);
                line.Text = "绀珠之药（无限~）";
                break;
            }
        }
    }
}

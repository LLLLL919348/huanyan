using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>
/// 法术超限（spell-overlimit）
///  · 酒狐【武器槽 +1】（共3个，新槽加在原来两个的左边）
///  · 酒狐【饰品槽 +3】（9 → 12，在下面再加一行）
///  · 所有「额外武器攻击」（多远程的交叉射击 / 多近战的投掷武器）：
///      触发频率 +100%、伤害 +20%、可同时调用的武器更多（密集程度增加）
///  · ★仅【酒狐】佩戴才生效（玩家饰品槽装备无效）
///
/// 获取方式：酒狐好感度达到 2 级后自动获得（见 酒狐玩家.PostUpdate 与 酒狐图鉴说明）
/// </summary>
public sealed class 法术超限 : ModItem
{
    public override string Texture => "酒狐npc仆从/饰品/spell_overlimit_core_big";

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.Purple;
        Item.value = Item.buyPrice(gold: 25);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    //===== 是否生效：★仅【酒狐】佩戴才生效（玩家饰品槽无效）=====
    public static bool 已装备(Player player)
    {
        if (player == null) return false;
        int type = ModContent.ItemType<法术超限>();
        酒狐玩家 data = player.GetModPlayer<酒狐玩家>();
        //扫酒狐全部12格（含法术超限解锁的额外3格，否则装在额外格里会自锁）
        for (int i = 0; i < data.Accessories.Length; i++)
        {
            Item acc = data.Accessories[i];
            if (acc != null && !acc.IsAir && acc.type == type) return true;
        }
        return false;
    }

    //仅酒狐可用：玩家自己的饰品栏无法装备（酒狐通过其专属饰品槽佩戴，不受此限制）
    public override bool CanEquipAccessory(Player player, int slot, bool modded)
        => false;

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(200, 110, 255);
                break;
            }
        }
        //★ 简单描述（写在代码里，保证一定能显示）
        tooltips.Add(new TooltipLine(Mod, "超限说明1", "[c/C86EFF:仅酒狐可佩戴]（玩家饰品栏无法装备）"));
        tooltips.Add(new TooltipLine(Mod, "超限说明2", "酒狐武器槽[c/C86EFF:+1]（加在原来两个的左边）"));
        tooltips.Add(new TooltipLine(Mod, "超限说明3", "酒狐饰品槽[c/C86EFF:+3]（在下面再加一行）"));
        tooltips.Add(new TooltipLine(Mod, "超限说明4", "额外武器攻击：频率[c/C86EFF:+100%]、伤害[c/C86EFF:+20%]、同时调用更多"));
        tooltips.Add(new TooltipLine(Mod, "超限说明5", "获取：酒狐[c/C86EFF:好感度达到2级]后自动获得"));
    }
}

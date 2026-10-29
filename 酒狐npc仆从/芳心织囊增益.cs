using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>芳心织囊（玩家侧增益）：正面buff时间翻倍、负面buff时间减半。
/// 注意：GlobalBuff.ReApply 基类返回 false（表示未改动）。本类只应在真正改动buff时长时返回 true，
/// 否则一律返回 false，才不会干扰 Vanilla 对持续/光环类buff的每tick刷新（否则图标会闪烁）。</summary>
public sealed class 芳心织囊增益 : GlobalBuff
{
    public override bool ReApply(int type, Player player, int time, int buffIndex)
    {
        // 没佩戴芳心织囊：不改变任何buff，返回 false（与基类一致，完全无副作用）
        if (!酒狐饰品.玩家佩戴(player, ModContent.ItemType<芳心织囊>()))
            return false;

        // 持续/光环/每tick刷新类buff：完全不动，返回 false
        if (Main.buffNoTimeDisplay[type] || 是持续类buff(type) || time <= 2)
            return false;

        // 不是“新获得”buff（已存在且还剩时间）：不动，返回 false
        if (player.buffTime[buffIndex] > 0)
            return false;

        // 真正新获得：翻倍/减半，并返回 true（表示改动过）
        player.buffTime[buffIndex] = Main.debuff[type] ? (int)(time * 0.5f) : time * 2;
        return true;
    }

    // 持续/光环类buff显式判定（短持续但时刻获取，不应走“翻倍/减半”）
    private static bool 是持续类buff(int type)
    {
        switch (type)
        {
            case BuffID.MonsterBanner:      //旗帜（攻/防）
            case BuffID.Sunflower:          //向日葵
            case BuffID.Campfire:           //篝火
            case BuffID.StarInBottle:       //瓶装星星
            case BuffID.MagicLantern:       //魔法灯笼
            case BuffID.SugarRush:          //糖果冲刺
            case BuffID.CatBast:            //猫神像
            case BuffID.WaterCandle:        //水蜡烛
            case BuffID.PeaceCandle:        //和平蜡烛
            case BuffID.Swiftness:          //迅捷
            case BuffID.Lucky:              //幸运
            case BuffID.WellFed:            //饱腹
            case BuffID.Sharpened:          //磨刀石
            case BuffID.DryadsWard:         //树妖守卫
            case BuffID.TikiSpirit:         //提基
            case BuffID.Gravitation:        //重力
                return true;
            default:
                return false;
        }
    }
}

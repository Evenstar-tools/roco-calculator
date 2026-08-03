import { Button } from "@tarojs/components";

export default function FavoriteButton({
  favorite = false,
  onToggle,
  spiritName,
}) {
  return (
    <Button
      aria-label={`${favorite ? "取消收藏" : "收藏"}${spiritName}`}
      aria-pressed={favorite}
      className={[
        "favorite-button",
        favorite ? "favorite-button--active" : "",
      ].filter(Boolean).join(" ")}
      onClick={onToggle}
    >
      {favorite ? "已收藏" : "收藏"}
    </Button>
  );
}

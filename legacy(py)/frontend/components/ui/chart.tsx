"use client";
import * as React from "react";
import { Tooltip as RechartsTooltip, TooltipProps } from "recharts";

import { cn } from "@/lib/utils";

// #region Chart Types
export type ChartConfig = {
	[key in string]: {
		label?: React.ReactNode;
		color?: string;
		icon?: React.ComponentType;
	};
};

type ChartContextProps = {
	config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

export function useChart() {
	const context = React.useContext(ChartContext);

	if (!context) {
		throw new Error("useChart must be used within a <ChartContainer />");
	}

	return context;
}
// #endregion

export const ChartContainer = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement> & {
		config: ChartConfig;
		children: React.ReactNode;
	}
>(({ config, className, children, ...props }, ref) => {
	const contextValue = React.useMemo(
		() => ({
			config,
		}),
		[config],
	);

	return (
		<ChartContext.Provider value={contextValue}>
			<div
				ref={ref}
				className={cn(
					"flex aspect-video items-center justify-center gap-4 [&>div]:h-full [&>div]:w-full",
					className,
				)}
				{...props}
			>
				{children}
			</div>
		</ChartContext.Provider>
	);
});
ChartContainer.displayName = "Chart";

export const ChartTooltip = RechartsTooltip;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const ChartTooltipContent = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		className={cn(
			"rounded-lg border bg-background/95 p-2 text-sm shadow-lg backdrop-blur-lg",
			className,
		)}
		{...props}
	/>
));
ChartTooltipContent.displayName = "ChartTooltipContent";

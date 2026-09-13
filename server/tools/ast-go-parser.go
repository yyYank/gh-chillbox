package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"strings"
)

type Symbol struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	StartLine int    `json:"startLine"`
	EndLine   int    `json:"endLine"`
}

type Relation struct {
	From string `json:"from"`
	To   string `json:"to"`
	Kind string `json:"kind"`
}

type HttpRoute struct {
	Method  string `json:"method"`
	Path    string `json:"path"`
	Handler string `json:"handler"`
	Line    int    `json:"line"`
}

type FileResult struct {
	Symbols    []Symbol    `json:"symbols"`
	Relations  []Relation  `json:"relations"`
	HttpRoutes []HttpRoute `json:"httpRoutes"`
}

type BatchInput struct {
	Files           []string `json:"files"`
	ExternalSymbols []string `json:"externalSymbols"`
}

var httpMethods = map[string]bool{
	"Get": true, "Post": true, "Put": true, "Delete": true, "Patch": true,
	"GET": true, "POST": true, "PUT": true, "DELETE": true, "PATCH": true,
	"Handle": true, "HandleFunc": true,
}

var httpMethodMap = map[string]string{
	"Get": "GET", "Post": "POST", "Put": "PUT", "Delete": "DELETE", "Patch": "PATCH",
	"GET": "GET", "POST": "POST", "PUT": "PUT", "DELETE": "DELETE", "PATCH": "PATCH",
	"Handle": "ANY", "HandleFunc": "ANY",
}

func main() {
	var input BatchInput

	if len(os.Args) >= 2 {
		input.Files = []string{os.Args[1]}
		var externalSymbols []string
		dec := json.NewDecoder(os.Stdin)
		if err := dec.Decode(&externalSymbols); err == nil {
			input.ExternalSymbols = externalSymbols
		}
	} else {
		dec := json.NewDecoder(os.Stdin)
		if err := dec.Decode(&input); err != nil {
			fmt.Fprintf(os.Stderr, "usage: ast-go-parser <file.go> or pipe BatchInput JSON to stdin\n")
			os.Exit(1)
		}
	}

	if len(input.Files) == 0 {
		fmt.Fprintf(os.Stderr, "no files specified\n")
		os.Exit(1)
	}

	results := make(map[string]FileResult, len(input.Files))
	for _, filePath := range input.Files {
		result := parseFile(filePath, input.ExternalSymbols)
		results[filePath] = result
	}

	if len(input.Files) == 1 {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(results[input.Files[0]]); err != nil {
			fmt.Fprintf(os.Stderr, "json error: %v\n", err)
			os.Exit(1)
		}
	} else {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(results); err != nil {
			fmt.Fprintf(os.Stderr, "json error: %v\n", err)
			os.Exit(1)
		}
	}
}

func extractReceiverType(expr ast.Expr) string {
	switch t := expr.(type) {
	case *ast.StarExpr:
		return extractReceiverType(t.X)
	case *ast.Ident:
		return t.Name
	}
	return ""
}

func parseFile(filePath string, externalSymbols []string) FileResult {
	fset := token.NewFileSet()

	f, err := parser.ParseFile(fset, filePath, nil, parser.ParseComments)
	if err != nil {
		return FileResult{Symbols: []Symbol{}, Relations: []Relation{}, HttpRoutes: []HttpRoute{}}
	}

	var symbols []Symbol
	bareNameSet := map[string]bool{}

	for _, name := range externalSymbols {
		bareNameSet[name] = true
		if idx := strings.LastIndex(name, "."); idx != -1 {
			bareNameSet[name[idx+1:]] = true
		}
	}

	ast.Inspect(f, func(n ast.Node) bool {
		switch decl := n.(type) {
		case *ast.FuncDecl:
			kind := "function"
			name := decl.Name.Name
			if decl.Recv != nil && len(decl.Recv.List) > 0 {
				kind = "method"
				recvType := extractReceiverType(decl.Recv.List[0].Type)
				if recvType != "" {
					name = recvType + "." + decl.Name.Name
				}
			}
			symbols = append(symbols, Symbol{
				Name:      name,
				Kind:      kind,
				StartLine: fset.Position(decl.Pos()).Line,
				EndLine:   fset.Position(decl.End()).Line,
			})
			bareNameSet[decl.Name.Name] = true
		case *ast.GenDecl:
			for _, spec := range decl.Specs {
				switch s := spec.(type) {
				case *ast.TypeSpec:
					kind := "type"
					switch s.Type.(type) {
					case *ast.InterfaceType:
						kind = "interface"
					case *ast.StructType:
						kind = "struct"
					}
					symbols = append(symbols, Symbol{
						Name:      s.Name.Name,
						Kind:      kind,
						StartLine: fset.Position(s.Pos()).Line,
						EndLine:   fset.Position(s.End()).Line,
					})
					bareNameSet[s.Name.Name] = true
				}
			}
		}
		return true
	})

	if symbols == nil {
		symbols = []Symbol{}
	}

	var relations []Relation
	seen := map[string]bool{}
	var httpRoutes []HttpRoute

	ast.Inspect(f, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}

		line := fset.Position(call.Pos()).Line
		caller := findContainingSymbol(symbols, line)

		switch fn := call.Fun.(type) {
		case *ast.Ident:
			if caller != "" && bareNameSet[fn.Name] && fn.Name != caller {
				key := caller + ":" + fn.Name + ":call"
				if !seen[key] {
					seen[key] = true
					relations = append(relations, Relation{From: caller, To: fn.Name, Kind: "call"})
				}
			}
		case *ast.SelectorExpr:
			methodName := fn.Sel.Name

			if httpMethods[methodName] && len(call.Args) >= 2 {
				if pathArg, ok := call.Args[0].(*ast.BasicLit); ok {
					pathVal := strings.Trim(pathArg.Value, `"`)
					if strings.HasPrefix(pathVal, "/") {
						handlerName := extractHandlerName(call.Args[len(call.Args)-1])
						method := httpMethodMap[methodName]
						httpRoutes = append(httpRoutes, HttpRoute{
							Method:  method,
							Path:    pathVal,
							Handler: handlerName,
							Line:    line,
						})
					}
				}
			}

			if caller != "" && bareNameSet[methodName] {
				key := caller + ":" + methodName + ":method-call"
				if !seen[key] {
					seen[key] = true
					relations = append(relations, Relation{From: caller, To: methodName, Kind: "method-call"})
				}
			}
		}

		return true
	})

	if relations == nil {
		relations = []Relation{}
	}
	if httpRoutes == nil {
		httpRoutes = []HttpRoute{}
	}

	return FileResult{Symbols: symbols, Relations: relations, HttpRoutes: httpRoutes}
}

func findContainingSymbol(symbols []Symbol, line int) string {
	for _, sym := range symbols {
		if sym.Kind != "function" && sym.Kind != "method" {
			continue
		}
		if line >= sym.StartLine && line <= sym.EndLine {
			return sym.Name
		}
	}
	return ""
}

func extractHandlerName(expr ast.Expr) string {
	switch e := expr.(type) {
	case *ast.Ident:
		return e.Name
	case *ast.SelectorExpr:
		return e.Sel.Name
	}
	return ""
}

// godoc は stdin で受け取った Go ソースから、go/doc と同じ解釈で export されたシンボルの doc を抽出して JSON で返す。
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/doc"
	"go/parser"
	"go/printer"
	"go/token"
	"os"
	"sort"
	"strings"
)

type SourceFile struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

type PackageInput struct {
	Dir   string       `json:"dir"`
	Files []SourceFile `json:"files"`
}

type Item struct {
	Kind    string `json:"kind"`
	Name    string `json:"name"`
	Decl    string `json:"decl"`
	DocText string `json:"docText"`
	DocHTML string `json:"docHtml"`
}

type PackageDoc struct {
	Dir     string `json:"dir"`
	Name    string `json:"name"`
	DocText string `json:"docText"`
	DocHTML string `json:"docHtml"`
	Items   []Item `json:"items"`
}

func main() {
	var inputs []PackageInput
	if err := json.NewDecoder(os.Stdin).Decode(&inputs); err != nil {
		fmt.Fprintf(os.Stderr, "usage: pipe []PackageInput JSON to stdin: %v\n", err)
		os.Exit(1)
	}

	result := []PackageDoc{}
	for _, in := range inputs {
		result = append(result, extract(in)...)
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// 1つのディレクトリに複数のパッケージ名があれば、パッケージ名ごとに分けて返す
func extract(in PackageInput) []PackageDoc {
	fset := token.NewFileSet()
	byPkg := map[string][]*ast.File{}
	for _, f := range in.Files {
		if !strings.HasSuffix(f.Name, ".go") || strings.HasSuffix(f.Name, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(fset, f.Name, f.Content, parser.ParseComments)
		if err != nil {
			continue
		}
		byPkg[file.Name.Name] = append(byPkg[file.Name.Name], file)
	}

	names := make([]string, 0, len(byPkg))
	for name := range byPkg {
		names = append(names, name)
	}
	sort.Strings(names)

	docs := []PackageDoc{}
	for _, name := range names {
		files := byPkg[name]
		pkg, err := doc.NewFromFiles(fset, files, in.Dir)
		if err != nil {
			continue
		}
		docs = append(docs, toPackageDoc(in.Dir, pkg, fset, allComments(files)))
	}
	return docs
}

func toPackageDoc(dir string, pkg *doc.Package, fset *token.FileSet, comments []*ast.CommentGroup) PackageDoc {
	p := &docPrinter{pkg: pkg, fset: fset, comments: comments}
	items := []Item{}
	for _, v := range pkg.Consts {
		items = append(items, p.value("const", v))
	}
	for _, v := range pkg.Vars {
		items = append(items, p.value("var", v))
	}
	for _, t := range pkg.Types {
		items = append(items, p.item("type", t.Name, t.Decl, t.Doc))
		for _, v := range t.Consts {
			items = append(items, p.value("const", v))
		}
		for _, v := range t.Vars {
			items = append(items, p.value("var", v))
		}
		for _, f := range t.Funcs {
			items = append(items, p.fn("func", f.Name, f))
		}
		for _, m := range t.Methods {
			items = append(items, p.fn("method", t.Name+"."+m.Name, m))
		}
	}
	for _, f := range pkg.Funcs {
		items = append(items, p.fn("func", f.Name, f))
	}

	return PackageDoc{
		Dir:     dir,
		Name:    pkg.Name,
		DocText: pkg.Doc,
		DocHTML: string(pkg.HTML(pkg.Doc)),
		Items:   items,
	}
}

type docPrinter struct {
	pkg      *doc.Package
	fset     *token.FileSet
	comments []*ast.CommentGroup
}

func (p *docPrinter) value(kind string, v *doc.Value) Item {
	return p.item(kind, strings.Join(v.Names, ", "), v.Decl, v.Doc)
}

func (p *docPrinter) fn(kind, name string, f *doc.Func) Item {
	// 本体と doc コメントを除いた signature だけを出す
	decl := &ast.FuncDecl{Recv: f.Decl.Recv, Name: f.Decl.Name, Type: f.Decl.Type}
	return p.item(kind, name, decl, f.Doc)
}

func (p *docPrinter) item(kind, name string, decl ast.Decl, docText string) Item {
	return Item{
		Kind:    kind,
		Name:    name,
		Decl:    p.print(decl),
		DocText: docText,
		DocHTML: string(p.pkg.HTML(docText)),
	}
}

// struct フィールドのコメントも残すため、ファイルのコメントと一緒に出力する（decl 自身の doc は除く）
func (p *docPrinter) print(decl ast.Decl) string {
	if g, ok := decl.(*ast.GenDecl); ok {
		copied := *g
		copied.Doc = nil
		decl = &copied
	}
	var buf bytes.Buffer
	cfg := printer.Config{Mode: printer.UseSpaces | printer.TabIndent, Tabwidth: 8}
	if err := cfg.Fprint(&buf, p.fset, &printer.CommentedNode{Node: decl, Comments: p.comments}); err != nil {
		return ""
	}
	return buf.String()
}

func allComments(files []*ast.File) []*ast.CommentGroup {
	var all []*ast.CommentGroup
	for _, f := range files {
		all = append(all, f.Comments...)
	}
	sort.Slice(all, func(i, j int) bool { return all[i].Pos() < all[j].Pos() })
	return all
}
